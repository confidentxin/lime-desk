# AGENTS.md

## 项目契约

`青柠工作台 / Lime Desk` 是一个 React + Vite 桌面端 Web App，用于辅助生成小红书内容。详细产品规格以 `docs/SPEC.md` 为准。

前后端是两个独立进程：后端 API 服务 `server/index.mjs` 监听 `127.0.0.1:52881`，前端是纯静态 Vite 站点 `127.0.0.1:52880`，只允许后端地址作为跨域来源。接口契约以 `docs/API.md` 为准，改动接口必须同步该文件。

产品保持 3 列工作台形态：左侧流程/草稿导航，中间阶段式创作区，右侧模型配置、状态和错误提示。视觉保持 Pastel 3D Claymorphism，使用马卡龙色、大圆角黏土面板、柔和阴影和 3D soft icon；不要改成营销页、深色科技风、极简黑白风、纯聊天界面或通用 SaaS 后台。

## 核心功能

- 用户输入账号人设和创作关键词。
- 用户主动搜索小红书热门内容，并手动勾选内容加入本地 RAG 知识库；用户点击“自动化生成”时，可由文案生成模型选择参考内容并入库。
- AI 按阶段生成 10 个选题、5 篇文案、整套配图方案（统一视觉规范 + 1 张封面 + 2~6 张内页）和整套配图。
- 工作区数据持久化在服务端 `data/workspace.json`（原子写、损坏时备份重建），图片持久化在 `data/generated/`，笔记可导出到 `output/<项目slug>/`（`note.md` + `images/`）。
- 文案正文包含小红书话题标签，格式为 `#话题名称[话题]#`。
- 文案生成模型和图片生成模型支持单独配置，并自动缓存。
- 当前版本支持三类真实本地/云端链路：本机 `xhs` CLI 热门搜索、本地可选 CLI（内置 Codex/Kimi/Claude，并支持符合 Lime Desk print protocol 的自定义 CLI）文本生成、Codex CLI 本地图片生成，以及云端 OpenAI-compatible API 生成。RAG 入库必须来自用户手动勾选确认，或来自用户点击“自动化生成”后的本次模型决策。
- Kimi 官方云端 API（Moonshot 开放平台与 `api.kimi.com/coding` 会员接口）自动使用其兼容请求参数，不固定发送跨模型不兼容的 `temperature`；上游 400 等错误必须显示经过脱敏的具体原因。

## 风控边界

- `xiaohongshu-cli` / `xhs` 调用必须由用户主动触发，不做后台自动搜索、自动刷新或高频轮询。
- 搜索、采集、入库、生成、配图生成之间要有清晰的用户确认边界；“自动化生成”按钮视为本次串行流程的一次完整确认。
- 本地 CLI 检测必须由用户点击“检测本机 CLI”触发；本地 CLI 和云端 API 生成必须由用户点击搜索、生成或“自动化生成”按钮触发，不做后台检测或自动生成；服务端只通过本地 Node middleware 以 `shell: false` 和参数数组执行 CLI 或转发 API 请求，不在浏览器中执行命令。
- 当前核心范围不包含自动发布、自动点赞、自动评论、自动收藏、自动关注、自动私信或自动批量采集。
- 生成内容要真实、具体、有信息量，避免空洞夸张、虚假体验、医疗/金融等高风险承诺。
- 配图 Prompt（含统一风格规范、封面与内页逐条）不包含真人、脸、手和动物，可以使用植物或花材作为辅助元素。

## 实现地图

- 产品规格：`docs/SPEC.md`；接口契约：`docs/API.md`
- 应用入口：`src/App.jsx`
- 全局样式和视觉 token：`src/styles.css`
- 后端独立服务入口：`server/index.mjs`（CORS、端口、静态图片托管）
- 本地生成 API 路由：`server/codex/`
- 本地 CLI 注册与协议适配：`server/localCli/`
- 小红书搜索 CLI adapter：`server/xhs/`
- 工作区持久化：`server/store.mjs` → `data/workspace.json`
- 笔记导出：`server/export.mjs` → `output/`
- 生成图片持久化目录：`data/generated/`，URL 为 `/generated/covers/*.png`
- 资源文件：`public/assets/`

## 开发命令

```bash
npm run launch:fixed   # 先起后端 52881，再起前端 52880
npm run server         # 只启动后端 API
npm run build
```

## 修改规则

- 产品或交互变化：同步更新 `docs/SPEC.md` 和本文件。
- 视觉或布局变化：保留当前 3 列工作台和 Pastel 3D Claymorphism 方向。
- 涉及 `xiaohongshu-cli`、本地 CLI 检测、搜索、RAG 入库或生成链路时，必须保留用户主动触发和确认边界；自动化流程只能由用户点击“自动化生成”启动。
- 完成改动后至少运行 `npm run build`；视觉布局改动还需要截图或浏览器检查。
