// dsh-vision-api-localorweb/src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
var NS = settingsNamespace("vision-api");
var VisionConfigSchema = z.object({
  baseUrl: z.string().default(""),
  model: z.string().default(""),
  apiKey: z.string().default("")
});
var name = "vision-api";
var inject = ["tools"];
var DEFAULT_MODEL = "gemma-4-e4b";
var MAX_IMAGE_BYTES = 15 * 1024 * 1024;
var TOOL_TIMEOUT_MS = 3e5;
function mimeOf(path) {
  const p = path.toLowerCase();
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".bmp")) return "image/bmp";
  return "image/png";
}
function readConfig(value) {
  if (typeof value !== "object" || value === null) return { baseUrl: "", model: "", apiKey: "" };
  const v = value;
  return {
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl.trim() : "",
    model: typeof v.model === "string" ? v.model.trim() : "",
    apiKey: typeof v.apiKey === "string" ? v.apiKey.trim() : ""
  };
}
async function callVision(cfg, imageB64, mime, question, signal, fetchImpl) {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const body = {
    model: cfg.model || DEFAULT_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: question || "\u8BF7\u8BE6\u7EC6\u63CF\u8FF0\u8FD9\u5F20\u56FE\u7247\u7684\u5185\u5BB9\u3002" },
          { type: "image_url", image_url: { url: `data:${mime};base64,${imageB64}` } }
        ]
      }
    ],
    stream: false,
    // reasoning models (e.g. Gemma) can spend the whole budget on thought and
    // return an empty `content`; give them room.
    max_tokens: 4096
  };
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`\u672C\u5730\u6A21\u578B\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94 (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok || parsed.error) {
    const detail = parsed.error ? JSON.stringify(parsed.error) : text.slice(0, 500);
    throw new Error(`\u672C\u5730\u6A21\u578B\u63A5\u53E3\u62A5\u9519 (HTTP ${response.status}): ${detail}`);
  }
  const choice = parsed.choices && parsed.choices[0];
  if (!choice) throw new Error(`\u672C\u5730\u6A21\u578B\u54CD\u5E94\u7F3A\u5C11 choices: ${text.slice(0, 500)}`);
  const message = choice.message || {};
  const content = typeof message.content === "string" ? message.content : "";
  const reasoning = typeof message.reasoning_content === "string" ? message.reasoning_content : "";
  if (content) return content;
  if (reasoning) return reasoning;
  return `\u672C\u5730\u6A21\u578B\u672A\u8FD4\u56DE\u6709\u6548\u5185\u5BB9 (finish_reason=${choice.finish_reason ?? ""})\u3002`;
}
function apply(ctx, config) {
  const entryConfig = readConfig(config);
  let settingsScope;
  ctx.inject(["settings"], (settingsCtx) => {
    settingsScope = settingsCtx.settings.register(NS, VisionConfigSchema, {
      base: { ...entryConfig }
    });
  });
  ctx.tools.register(
    defineTool({
      name: "local_vision",
      description: "\u4F7F\u7528\u672C\u5730\u914D\u7F6E\u7684\u8BC6\u56FE\u6A21\u578B\uFF08OpenAI \u517C\u5BB9\u63A5\u53E3\uFF09\u7406\u89E3\u4E00\u5F20\u56FE\u7247\u3002\u4F20\u5165\u56FE\u7247\u6587\u4EF6\u7684\u672C\u5730\u8DEF\u5F84\uFF0C\u53EF\u9009\u5730\u63D0\u51FA\u5173\u4E8E\u56FE\u7247\u7684\u95EE\u9898\uFF0C\u8FD4\u56DE\u6A21\u578B\u7684\u6587\u5B57\u56DE\u7B54\u3002\u82E5\u672A\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u63A5\u53E3\u5730\u5740\uFF0C\u5219\u8FD4\u56DE\u672A\u914D\u7F6E\u63D0\u793A\u3002",
      parameters: {
        image_path: {
          type: "string",
          required: true,
          description: "\u56FE\u7247\u6587\u4EF6\u7684\u672C\u5730\u8DEF\u5F84\uFF08PNG/JPEG/WebP/GIF/BMP\uFF09"
        },
        question: {
          type: "string",
          description: "\u5173\u4E8E\u8FD9\u5F20\u56FE\u7247\u7684\u95EE\u9898\uFF1B\u7559\u7A7A\u5219\u9ED8\u8BA4\u8BA9\u6A21\u578B\u8BE6\u7EC6\u63CF\u8FF0\u56FE\u7247\u5185\u5BB9"
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: String(value) }]
      },
      timeoutMs: TOOL_TIMEOUT_MS,
      async execute(args, exec) {
        const cfg = settingsScope ? readConfig(settingsScope.get()) : entryConfig;
        if (!cfg.baseUrl) {
          return "\u672A\u914D\u7F6E\u8BC6\u56FE\u6A21\u578B API\u3002\u8BF7\u5728 \u8BBE\u7F6E \u2192 \u53EF\u63A5\u5165\u8BC6\u56FE\u6A21\u578B API \u4E2D\u586B\u5199\u63A5\u53E3\u5730\u5740\uFF08\u5730\u5740\u7559\u7A7A\u5373\u4E0D\u542F\u7528\u8BC6\u56FE\u6A21\u578B\uFF09\u3002";
        }
        const fs = ctx.get("fs");
        let bytes;
        if (fs && typeof fs.readBytes === "function") {
          const target = await fs.resolve(args.image_path);
          bytes = await fs.readBytes(target, exec.signal, MAX_IMAGE_BYTES);
        } else {
          const { readFile } = await import("node:fs/promises");
          const buf = await readFile(args.image_path);
          bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        }
        const b64 = bytesToBase64(bytes);
        const mime = mimeOf(args.image_path);
        return callVision(cfg, b64, mime, args.question, exec.signal, fetch);
      }
    })
  );
}
function bytesToBase64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const len = bytes.length;
  let out = "";
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const n = b0 << 16 | b1 << 8 | b2;
    out += alphabet.charAt(n >> 18 & 63);
    out += alphabet.charAt(n >> 12 & 63);
    out += i + 1 < len ? alphabet.charAt(n >> 6 & 63) : "=";
    out += i + 2 < len ? alphabet.charAt(n & 63) : "=";
  }
  return out;
}
export {
  apply,
  inject,
  name
};
