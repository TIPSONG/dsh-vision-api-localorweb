<h1 align="center">dsh-vision-api-localorweb</h1>

<p align="center">DSH 插件：接入本地识图模型 API —— 一个 <code>local_vision</code> 识图工具 + 设置界面里的「可接入识图模型 API」配置页。接口留空即不启用识图。</p>

> DSH plugin: pluggable local vision-model API — a `local_vision` tool plus a settings page; leave the endpoint blank to disable vision.

## 能力面

| Tools | 说明 |
| --- | --- |
| `local_vision` | 读取本地图片并交给 OpenAI 兼容的识图接口，返回文字描述；接口留空时返回「未配置」提示 |

| UI | 说明 |
| --- | --- |
| 设置 → 可接入识图模型 API | 三个输入框（接口地址 / 模型名 / API Key），留空接口地址即禁用识图 |

## 安装

本地目录安装（构建产物入库后）：

```sh
cd dsh-vision-api-localorweb
npm install
npm run build          # 产出 lib/index.js + lib/client.js
dsh plugin --profile web add .
```

或 git 源（产物已提交进仓库时，真一行安装）：

```sh
dsh plugin --profile web add "github:<owner>/dsh-vision-api-localorweb#<ref>"
```

> 说明：本插件使用 `dsh.client` 声明（`platform: web`）+ `exports["./client"]` 提供浏览器设置页，`main` 提供 Node 工具半。安装后重启 web 生效。

## 使用

1. 打开 设置 → 可接入识图模型 API。
2. 填接口地址（如 `http://localhost:1234/v1`）和模型名（如 `gemma-4-e4b`），API Key 本地服务通常留空。
3. 点保存。之后让助手看图时，助手会调用 `local_vision` 把图片发给你本地的识图模型。
4. 把接口地址清空保存，即回到「不使用识图模型」。

## 配置字段

| 字段 | 说明 |
| --- | --- |
| `baseUrl` | OpenAI 兼容接口的 base URL（`http://host:port/v1`）。留空 = 禁用识图 |
| `model` | 模型 ID（LM Studio 里加载的名字，如 `gemma-4-e4b`） |
| `apiKey` | 可选鉴权头；留空则不发送 |

## 插件管理

已装插件用 plugin-registry 的**薄控制台**管理（浏览器面板）：管理 profile
插件安装态（bundle 层栈 + insert 行 + 启停），无需手改配置。安装：

```sh
dsh plugin --profile web add <plugin-registry>/packages/plugin/console
```

## 开发

```sh
npm install
npm run build          # 重新构建 lib/
```

- `src/index.ts`：Node 半（settings namespace + `local_vision` 工具）
- `src/client.ts`：浏览器半（设置页）
- `scripts/build.mjs`：esbuild 构建脚本（ESM host + `__ModuleLoader__` client bundle）

## License

MIT
