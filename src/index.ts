/**
 * dsh-vision-api-localorweb — Host half.
 *
 * Registers:
 *  - the model-facing `local_vision` tool, which reads a JSON config file and
 *    calls an OpenAI-compatible vision endpoint. An empty `baseUrl` disables the
 *    feature: the tool returns a "not configured" message instead of calling out.
 *  - a `webServer` route `GET/POST /api/vision-config` that the browser settings
 *    page uses to read and persist the same config file.
 *
 * Configuration is persisted to a JSON file (not the settings namespace), because
 * the rc.6 api-proxy only exposes a hard-coded allowlist of settings namespaces to
 * the browser — a third-party namespace would answer `settings-not-exposed` and the
 * page's save button would silently no-op. A file under the DSH home survives
 * restarts and workspaces without touching that allowlist.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'vision-api'

/** Hard dependencies: tool registry and the web route carrier. */
export const inject = ['tools', 'webServer', 'systemPrompt']

/** Default model name, used when the user leaves the field blank. */
const DEFAULT_MODEL = 'gemma-4-e4b'

/** Max image bytes accepted in one call (15 MiB). */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/** Cooperative tool-call budget: the vision model is slow, be generous. */
const TOOL_TIMEOUT_MS = 300_000

/** HTTP route path shared with the client half. */
const CONFIG_ROUTE = '/api/vision-config'

/** Resolved, de-branded view of the durable config. */
interface VisionConfig {
  baseUrl: string
  model: string
  apiKey: string
}

/** Strip a config-shaped value down to the three scalar fields we need. */
function readConfig(value: unknown): VisionConfig {
  if (typeof value !== 'object' || value === null) return { baseUrl: '', model: '', apiKey: '' }
  const v = value as Record<string, unknown>
  return {
    baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl.trim() : '',
    model: typeof v.model === 'string' ? v.model.trim() : '',
    apiKey: typeof v.apiKey === 'string' ? v.apiKey.trim() : '',
  }
}

/** Absolute path of the JSON config file, under the DSH home when resolvable. */
function configFilePath(): string {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(dshHome, 'vision-api-config.json')
}

/** Read the config file; a missing or malformed file resolves to empty. */
async function loadConfig(): Promise<VisionConfig> {
  try {
    return readConfig(JSON.parse(await readFile(configFilePath(), 'utf8')))
  } catch {
    return { baseUrl: '', model: '', apiKey: '' }
  }
}

/** Persist the config file (creating parent directories as needed). */
async function saveConfig(cfg: VisionConfig): Promise<void> {
  const path = configFilePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

/** Map a file path to a vision MIME type from its extension. */
function mimeOf(path: string): string {
  const p = path.toLowerCase()
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.gif')) return 'image/gif'
  if (p.endsWith('.bmp')) return 'image/bmp'
  return 'image/png'
}

/**
 * Call one OpenAI-compatible `/chat/completions` endpoint with an image.
 * Returns the assistant text; throws a descriptive Error on failure.
 */
async function callVision(
  cfg: VisionConfig,
  imageB64: string,
  mime: string,
  question: string | undefined,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const body = {
    model: cfg.model || DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: question || '请详细描述这张图片的内容。' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageB64}` } },
        ],
      },
    ],
    stream: false,
    // reasoning models (e.g. Gemma) can spend the whole budget on thought and
    // return an empty `content`; give them room.
    max_tokens: 4096,
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  const text = await response.text()
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`本地模型返回了非 JSON 响应 (HTTP ${response.status}): ${text.slice(0, 500)}`)
  }
  if (!response.ok || parsed.error) {
    const detail = parsed.error ? JSON.stringify(parsed.error) : text.slice(0, 500)
    throw new Error(`本地模型接口报错 (HTTP ${response.status}): ${detail}`)
  }
  const choice = parsed.choices && parsed.choices[0]
  if (!choice) throw new Error(`本地模型响应缺少 choices: ${text.slice(0, 500)}`)
  const message = choice.message || {}
  const content: string = typeof message.content === 'string' ? message.content : ''
  const reasoning: string = typeof message.reasoning_content === 'string' ? message.reasoning_content : ''
  if (content) return content
  if (reasoning) return reasoning
  return `本地模型未返回有效内容 (finish_reason=${choice.finish_reason ?? ''})。`
}

/** Read the JSON body of an incoming request (bounded). */
async function readJsonBody(req: any): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.length === 0) return undefined
  return JSON.parse(raw)
}

/**
 * True when one content block tree contains an image block, walking nested
 * tool-result content (the same recursion the LLM runtime uses).
 */
function contentHasImage(blocks: any[]): boolean {
  return blocks.some((block) => block.type === 'image' || (block.type === 'tool-result' && contentHasImage(block.content ?? [])))
}

/**
 * Translate every image block in a content tree into a text description
 * produced by the locally configured vision model. Non-image blocks pass
 * through untouched. Failures degrade to a stable placeholder instead of
 * breaking the step.
 */
async function translateContentBlocks(
  blocks: any[],
  translateImage: (ref: any) => Promise<string>,
): Promise<any[]> {
  const out: any[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      let text: string
      try {
        text = await translateImage(block.attachment)
      } catch (error) {
        text = `[图片存在，但本地识图模型暂不可用：${error instanceof Error ? error.message : String(error)}]`
      }
      out.push({ type: 'text', text: `[图片内容（本地识图模型描述）]\n${text}` })
    } else if (block.type === 'tool-result') {
      const content = await translateContentBlocks(block.content ?? [], translateImage)
      out.push({ ...block, content })
    } else {
      out.push(block)
    }
  }
  return out
}

/**
 * Register the `local_vision` tool, the config route, and the image
 * pre-translation hook. The hook bridges a text-only conversation model
 * (e.g. deepseek-v4) and the local vision model: before each model step,
 * image blocks in the pending messages are replaced with text descriptions,
 * so a model that cannot see images still understands them.
 */
export function apply(ctx: any, config: unknown): void {
  const entryConfig = readConfig(config)

  // Guidance: when the conversation model cannot see images itself, route
  // image questions through the local vision tool instead of read_image.
  ctx.systemPrompt.section({
    name: 'vision-api',
    order: 150,
    text: '当前对话模型可能不支持直接读取图片。当你需要理解图片内容时，使用 local_vision 工具（它会把图片交给本地识图模型并返回文字描述）；不要使用 read_image 工具，它可能报错「不支持视图」。',
  })

  // Register the browser-facing config route (GET read / POST write).
  ctx.webServer.register({
    kind: 'exact',
    path: CONFIG_ROUTE,
    handler: async (req: any, res: any) => {
      try {
        if (req.method === 'GET') {
          const cfg = await loadConfig()
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(cfg))
        } else if (req.method === 'POST') {
          const body = readConfig(await readJsonBody(req))
          await saveConfig(body)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(body))
        } else {
          res.writeHead(405, { allow: 'GET, POST' })
          res.end('method not allowed')
        }
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    },
  })

  // Image pre-translation: when the conversation route cannot accept images,
  // turn pending image blocks into local-model text descriptions first.
  ctx.on('agent/pre-step', async (payload: any, next: any) => {
    const decision = await next()
    if (decision?.kind !== 'enter') return decision

    const messages: any[] = decision.messages ?? []
    if (!messages.some((message) => contentHasImage(message.content ?? []))) return decision

    const cfg = await loadConfig()
    if (!cfg.baseUrl) return decision

    const llm = ctx.get('llm')
    const attachments = ctx.get('attachments')
    if (!llm || !attachments) return decision

    // Skip translation when the routed model already accepts images.
    const provider = payload.agent?.options?.provider
    const model = payload.agent?.options?.model
    let supportsImage = false
    if (provider && model) {
      try {
        const info = await llm.resolveModelInfo(provider, model, payload.signal)
        supportsImage = Array.isArray(info.inputModalities) && info.inputModalities.includes('image')
      } catch {
        /* unknown route: fall through and translate */
      }
    }
    if (supportsImage) return decision

    const cache = new Map<string, string>()
    const translateImage = async (ref: any) => {
      const key = String(ref?.attachmentId ?? '')
      if (cache.has(key)) return cache.get(key)!
      const stored = await attachments.readImage(ref, payload.signal)
      const b64 = bytesToBase64(stored.data)
      const text = await callVision(cfg, b64, stored.ref.mediaType, undefined, payload.signal, fetch)
      cache.set(key, text)
      return text
    }

    let translated: any[]
    try {
      translated = await Promise.all(messages.map(async (message) => ({
        ...message,
        content: await translateContentBlocks(message.content ?? [], translateImage),
      })))
    } catch {
      return decision
    }
    return { kind: 'enter', messages: translated }
  })

  ctx.tools.register(
    defineTool({
      name: 'local_vision',
      description:
        '使用本地配置的识图模型（OpenAI 兼容接口）理解一张图片。传入图片文件的本地路径，可选地提出关于图片的问题，返回模型的文字回答。若未在设置中配置接口地址，则返回未配置提示。',
      parameters: {
        image_path: {
          type: 'string',
          required: true,
          description: '图片文件的本地路径（PNG/JPEG/WebP/GIF/BMP）',
        },
        question: {
          type: 'string',
          description: '关于这张图片的问题；留空则默认让模型详细描述图片内容',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
      },
      timeoutMs: TOOL_TIMEOUT_MS,
      async execute(args: any, exec: any): Promise<string> {
        // File is authoritative; fall back to the composition entry config when
        // the file has never been written.
        const cfg = await loadConfig()
        const effective = cfg.baseUrl || cfg.model || cfg.apiKey ? cfg : entryConfig
        if (!effective.baseUrl) {
          return '未配置识图模型 API。请在 设置 → 可接入识图模型 API 中填写接口地址（地址留空即不启用识图模型）。'
        }

        let bytes: Uint8Array
        const buf = await readFile(args.image_path)
        bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          throw new Error(`图片超过 ${MAX_IMAGE_BYTES} 字节上限。`)
        }

        const b64 = bytesToBase64(bytes)
        const mime = mimeOf(args.image_path)
        return callVision(effective, b64, mime, args.question, exec.signal, fetch)
      },
    }),
  )
}

/** Encode a Uint8Array as base64 without relying on Buffer. */
function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const len = bytes.length
  let out = ''
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < len ? bytes[i + 1] : 0
    const b2 = i + 2 < len ? bytes[i + 2] : 0
    const n = (b0 << 16) | (b1 << 8) | b2
    out += alphabet.charAt((n >> 18) & 63)
    out += alphabet.charAt((n >> 12) & 63)
    out += i + 1 < len ? alphabet.charAt((n >> 6) & 63) : '='
    out += i + 2 < len ? alphabet.charAt(n & 63) : '='
  }
  return out
}
