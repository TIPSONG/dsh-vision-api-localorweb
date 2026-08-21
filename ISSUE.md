# 当对话模型不支持图片时，插件无法让「拖拽发图」走本地识图模型（api-proxy 硬编码拒绝，无拦截点）

## 背景

本插件（`local_vision` 识图工具）的设计目标之一：对话模型是**纯文本模型**（如 `deepseek-v4-pro`）时，用户发来的图片自动转交给**本地识图模型**（LM Studio 里的 Gemma 等），把文字描述喂回给纯文本模型——即「给不能识图的模型识图」。

## 现状与根因

测试发现：**拖拽/粘贴发图时，图片在消息提交阶段就被拒绝**，提示「当前模型不支持图片，请切换支持图片的模型」。

排查链路（DSH `0.1.1-rc.2`）：

1. 浏览器提交图片 → `dsh-host-apiproxy` 的 `prompt` 处理器：

```js
const hasImage = content.some((part) => part.type === "image");
if (hasImage) {
  const current = selectionFor(agent).current;
  const modelInfo = await ctx.llm.resolveModelInfo(current.provider, current.model);
  if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image"))
    return err(request, { code: "attachment-error", reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" });
}
```

2. 前端 `dsh-client-ui-conversation` 把这个 reason 渲染为「当前模型不支持图片」。

3. 这个检查发生在 **api-proxy 内部、没有任何 waterfall/事件可拦截**（`agent/pre-step`、`llm/stream` 等插件可用的钩子都在它之后）。

4. 插件尝试用 `agent/pre-step` 转译 image block → 本地模型 → 文字，技术上已实现，但图片消息根本到不了该钩子。

## 相关发现

- LLM 层已有内置的 `projectImagesForTextModel`：当消息历史里**已有** image block 而当前模型只接受文字时，自动替换为占位符文字（`[image omitted because this model accepts text only...]`）。说明「图片→文字」的方向官方已在做，但目前是占位符而非真实描述，且入口（拖拽发图）被更上游的 `MODEL_DOES_NOT_SUPPORT_IMAGES` 检查挡住。
- `read_image` 工具同样在 `assertImageCapableRoute` 处检查当前路由模型的 `inputModalities`，纯文本模型下直接报错「model does not declare image input」。

## 期望

任选其一即可解锁「纯文本模型 + 本地识图」：

1. **给 `prompt` 的图片准入加一个 waterfall 钩子**，让插件能把「图片 → 本地模型转译 → 文字」插入到拒绝检查之前；
2. **把 `projectImagesForTextModel` 的占位符升级为可配置的转译回调**，允许插件提供真正的图片描述；
3. **把图片准入检查改为可配置**（如允许插件声明「当前路由的图片由我接管」）。

## 当前绕过方案

图片放本地磁盘，对话中给出**文件路径**，由 `local_vision` 工具读取并转交本地模型。可用，但体验不如直接拖图。
