/**
 * dsh-vision-api-localorweb — Host half.
 *
 * Registers:
 *  - a settings namespace `vision-api` (baseUrl / model / apiKey) for durable
 *    configuration, layered over the composition entry config when present;
 *  - the model-facing `local_vision` tool, which reads the resolved config and
 *    calls an OpenAI-compatible vision endpoint. An empty `baseUrl` disables the
 *    feature: the tool returns a "not configured" message instead of calling out.
 *
 * This module targets the rc.6 runtime. It uses the real Cordis APIs (no
 * dynamic-sandbox `harness.*` helpers): `ctx.tools.register(defineTool(...))`,
 * `ctx.inject(['settings'], ...)`, and the `settings`/`tools`/`fs` services.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by this plugin (lowercase kebab-case). */
const NS = settingsNamespace('vision-api')

/** Durable config schema — also the wire envelope the browser scope validates. */
const VisionConfigSchema = z.object({
  baseUrl: z.string().default(''),
  model: z.string().default(''),
  apiKey: z.string().default(''),
})

/** Cordis plugin name used by loader diagnostics. */
export const name = 'vision-api'

/** Hard dependency: the tool registry. `settings` and `fs` are optional (degraded below). */
export const inject = ['tools']

/** Default model name, used when the user leaves the field blank. */
const DEFAULT_MODEL = 'gemma-4-e4b'

/** Max image bytes accepted in one call (15 MiB). */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/** Cooperative tool-call budget: the vision model is slow, be generous. */
const TOOL_TIMEOUT_MS = 300_000

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

/**
 * Register the settings namespace and the `local_vision` tool.
 *
 * `settings` is optional: the durable config is layered under the composition
 * entry's `config` (the `base` layer). When the settings provider is absent —
 * or the user leaves `baseUrl` blank — the tool reports "not configured".
 */
export function apply(ctx: any, config: unknown): void {
  const entryConfig = readConfig(config)

  // Optional settings injection: register the durable namespace whenever a
  // settings provider exists, and keep the live scope for the tool to read.
  let settingsScope: { get(): unknown } | undefined
  ctx.inject(['settings'], (settingsCtx: any) => {
    settingsScope = settingsCtx.settings.register(NS, VisionConfigSchema, {
      base: { ...entryConfig },
    })
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
        const cfg = settingsScope ? readConfig(settingsScope.get()) : entryConfig
        if (!cfg.baseUrl) {
          return '未配置识图模型 API。请在 设置 → 可接入识图模型 API 中填写接口地址（地址留空即不启用识图模型）。'
        }

        // Read the image bytes. Use the injected `fs` service when present so
        // the read observes the harness filesystem policy; fall back to Node's
        // global fetch for the HTTP call (present in the rc.6 runtime).
        const fs = ctx.get('fs')
        let bytes: Uint8Array
        if (fs && typeof fs.readBytes === 'function') {
          const target = await fs.resolve(args.image_path)
          bytes = await fs.readBytes(target, exec.signal, MAX_IMAGE_BYTES)
        } else {
          const { readFile } = await import('node:fs/promises')
          const buf = await readFile(args.image_path)
          bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        }

        const b64 = bytesToBase64(bytes)
        const mime = mimeOf(args.image_path)
        return callVision(cfg, b64, mime, args.question, exec.signal, fetch)
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
