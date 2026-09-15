# QA_LOG.md

## 2026-07-22 Kimi 云端 API HTTP 400 兼容修复

- Kimi 官方 `api.moonshot.cn` / `api.moonshot.ai` 文本请求不再固定发送 `temperature: 0.7`，避免 K2.5、K2.6、K3 等模型因采样参数限制返回 HTTP 400。
- Kimi Code 会员 OpenAI-compatible 地址 `https://api.kimi.com/coding/v1` 同样纳入兼容识别；真实浏览器请求已复现该接口对 `kimi-for-coding` 返回 `invalid temperature: only 1 is allowed for this model`。
- Kimi 官方请求改用 `max_completion_tokens` 并启用 `response_format: {"type":"json_object"}`；其他 OpenAI-compatible 供应商继续保留原请求字段，避免扩大兼容性影响。
- 云端 API 非 2xx 响应会解析并展示供应商的 `error.message`，同时继续对 API Key 脱敏。
- Chrome 真实 Kimi Code 会员 API smoke：使用 `kimi-for-coding` 与 `https://api.kimi.com/coding/v1`，先生成正好 10 个选题，再生成正好 5 篇文案和 5 份封面 Prompt；文案均保留 `#话题名称[话题]#`，Prompt 均明确排除真人、脸、手和动物。页面最终状态为三段云端文本 API 成功，无 HTTP 400/401。

## 当前状态

- 项目：`青柠工作台 / Lime Desk`
- 类型：React + Vite 桌面端小红书 AI 助理
- 主要界面：3 列独立滚动的阶段式小红书内容创作工作台
- 视觉方向：Pastel 3D Claymorphism Dashboard
- 当前 QA 结论：通过

## 当前实现核对

- 左侧：品牌、创作者资料、创作流程、草稿项目、保存入口。
- 中间：新版概览、人设关键词、热门内容搜索、RAG 入库、10 个选题、撰写思路、5 篇文案、小红书预览、5 份封面 Prompt 和封面图结果。
- 右侧：文案生成模型配置、图片生成模型配置、状态与错误提示、错误覆盖检查。
- 当前 UI 使用 React state 驱动可见交互；热门搜索、选题、文案、封面 Prompt 和 PNG 封面图可通过本地 CLI 或云端 OpenAI-compatible API 生成。
- 人设、关键词、撰写思路和模型配置使用 `localStorage` 自动缓存。

## 新版流程 QA 重点

- 搜索必须由用户点击“搜索热门内容”或“自动化生成”触发，不能后台自动搜索。
- RAG 入库必须来自用户手动勾选后点击加入，或来自用户点击“自动化生成”后的本次模型决策；不能静默加入全部搜索结果。
- 生成选题、生成文案、生成封面 Prompt 和生成封面图都必须由用户点击手动按钮或“自动化生成”触发，并在右侧显示所选生成通道状态。
- 生成封面图会返回本地临时托管的 PNG 图片，必须由用户点击 Prompt 或“自动化生成”触发。
- 封面 Prompt 默认不包含真人、脸、手和动物，可以包含植物或花材。
- 封面图生成失败时必须保留原始 Prompt，方便重新生成。
- 云端 API 缺少模型名、API Key 或 API Base URL 时，需要显示配置缺失提示且不发起请求。

## 最近验证记录

### 2026-07-22 Claude Code 内置适配器

验证环境：

- 命令：`npm run build`、`node --check server/localCli/registry.mjs`、`git diff --check`
- App URL：`http://127.0.0.1:52880/`
- 本机 Claude Code：`2.1.205`

已验证：

- 本地 CLI 注册表新增 Claude Code，默认从 PATH 查找 `claude`，支持 `CLAUDE_CLI_PATH` 覆盖；能力声明为文本可用、图片不可用。
- 用户点击“检测本机 CLI”后，`POST /api/local-cli/detect` 返回 Claude Code 可用状态和版本 `2.1.205 (Claude Code)`；页面不会后台自动检测。
- Claude 文本适配器使用 `claude --print <prompt> --output-format json`，解析响应的 `result` 字段；调用时启用 safe mode、关闭工具调用和会话持久化。
- 真实 Claude API smoke：`POST /api/local-cli/generate` 返回 HTTP 200 和正好 10 个结构化选题，耗时约 40s；`commandPreview` 包含 Claude 非交互 JSON 模式及安全参数。
- 文案本地 CLI 下拉框支持 Codex、Kimi、Claude 和自定义规范 CLI；图片本地 CLI 仍只显示声明图片能力的 Codex。

### 2026-07-22 Kimi CLI 与通用本机 CLI 协议

验证环境：

- 命令：`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:52880/`
- 浏览器：用户 Chrome
- 本机 CLI：Kimi CLI `0.28.1`（OAuth，默认模型 `kimi-code/k3`）、Codex CLI `0.137.0`

已验证：

- 新增 `/api/local-cli/detect`、`/api/local-cli/generate`、`/api/local-cli/decide` 和 `/api/local-cli/cover-image`；保留原 `/api/codex/*` 兼容接口。
- “检测本机 CLI”只在用户点击后执行；检测到 Codex `codex-cli 0.137.0` 和 Kimi `0.28.1`，页面显示版本与可用状态。
- 文案本地 CLI 下拉框支持 Codex、Kimi、自定义规范 CLI；图片本地 CLI 只显示声明图片能力的 Codex，不把 Kimi 错误呈现为图片生成器。
- 自定义规范 CLI 的绝对路径分支已用 `/Users/ice/.kimi-code/bin/kimi` 检测通过，返回 `规范 CLI（kimi）` 与版本 `0.28.1`；以 `cliId: custom` 执行真实结构化决策也成功返回有效候选 ID。
- 真实 Kimi API smoke：`POST /api/local-cli/generate` 返回正好 10 个结构化选题，耗时约 44s；`POST /api/local-cli/decide` 返回有效候选 ID，耗时约 14s。
- Kimi 文案字段兼容回归：服务端接受 `coverDirection` 的 snake_case、常见英文别名和中文别名；模型完全漏传该字段时，根据文案标题生成安全的静物封面方向，不再整批报错。封面 Prompt 同步兼容常见字段别名。
- 本地 CLI 结构化输出失败统一返回 `LOCAL_CLI_BAD_JSON`，不再把 Kimi 等本地 CLI 的错误误标为 `CODEX_BAD_JSON`。
- 修复后真实调用 `POST /api/local-cli/generate`（Kimi，`drafts`）成功返回 5 篇文案，全部包含 `title`、`body`、`coverDirection` 和小红书话题标签，耗时约 79s。
- Chrome 主流程真实跑通：xhs 返回 22 条搜索结果；用户勾选 2 条并手动入库；Kimi 依次生成 10 个选题、5 篇文案、5 份封面 Prompt。文案正文保留 `#话题名称[话题]#`，Prompt 保留“明确排除真人、脸、手和动物”。
- Chrome 保持 3 列 Pastel 3D Claymorphism 工作台，Kimi 选择器和检测状态没有破坏布局；Console `error` / `warn` 为 0。
- 本机 Codex 图片链路当前被外部版本状态阻断：已安装的 CLI `0.137.0` 无法使用用户配置中的 `gpt-5.6-sol`。服务端现在返回 `CODEX_UPDATE_REQUIRED` 和可操作的 `codex update` 提示，不再只显示退出码 1；Kimi 文本链路不受影响。

### 2026-06-27 自动化生成入口与决策接口

验证环境：

- 命令：`npm install`、`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:5180/`（用户打开的 `5179` 属于另一个 worktree：`/Users/ice/.codex/worktrees/4e1f/XHS-g4`）
- 浏览器：Chrome，当前视口约 `1360x806`

已验证：

- “账号人设与创作关键词”标题区新增“自动化生成”按钮，并位于“搜索热门内容”左侧。
- 页面不是空白页，无 Vite / React 错误覆盖层，Console `error` / `warn` 为 0。
- 保持 3 列工作台结构，当前视口下列宽为 `220px / 788px / 292px`。
- 自动化按钮点击后会进入串行流程状态；本轮为避免继续触发完整 xhs、文本模型和 imagegen 长链路，已刷新页面中断后续外部生成。
- 新增 `/api/codex/decide` 和 `/api/cloud/decide` 前置校验可达：空候选项返回 `BAD_REQUEST`，无效 `decisionKind` 返回 `BAD_REQUEST`，不会进入模型调用。
- 文档已同步自动化一次确认边界：RAG 入库可以来自手动勾选确认，或来自用户点击“自动化生成”后的本次模型决策。

### 2026-06-27 云端选题 reason 字段兼容修复

验证环境：

- 命令：`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:5179/`
- 真实云端文本 API：用户已在浏览器配置，回归时未回显 API Key
- 浏览器：Chrome，用户已打开页面，当前视口约 `1497x806`

已验证：

- 云端选题返回缺少 `reason` 字段时不再整批失败；服务端会基于同一条选题的 `angle`、`audience`、`hook` 生成内部推荐理由。
- 选题仍强校验 10 条数量，以及 `title`、`angle`、`audience`、`hook` 核心字段；不会用 mock 数据静默补齐缺失选题。
- 选题字段兼容常见中文 key，例如 `标题`、`选题角度`、`目标受众`、`推荐理由`、`内容爆点`。
- Prompt 已加固，明确要求云端模型每条选题都返回英文 key：`title`、`angle`、`audience`、`reason`、`hook`。
- API smoke 已覆盖：10 条选题缺少 `reason` 成功归一化、中文 key 成功归一化、缺少核心字段仍失败、数量不足仍失败。
- Chrome QA 已用当前页面配置跑通：搜索、勾选入库、云端生成 10 个选题；页面未再出现“云端 API 返回缺少字段：reason。”。
- 页面不是空白页，无 Vite / React 错误覆盖层，Console `error` / `warn` 为 0。

### 2026-06-27 云端 API 支持

验证环境：

- 命令：`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:5179/`（5173-5178 已被占用，本轮使用 5179）
- Mock provider：`http://127.0.0.1:5999/v1`
- 浏览器：in-app Browser，视口 `1440x900` 和 `1440x720`

已验证：

- 新增 `/api/cloud/generate` 可通过 OpenAI-compatible Chat Completions mock 返回 10 个选题、5 篇文案和 5 份封面 Prompt。
- 云端文案正文保留 `#话题名称[话题]#` 格式，封面 Prompt 保留“明确排除真人、脸、手和动物”边界。
- 新增 `/api/cloud/cover-image` 可处理 `b64_json` 和 `url` 两种图片响应，并统一发布为 `/generated/covers/*.png`。
- 云端图片输出已验证 HTTP 可访问、PNG signature 正确、封面结果和小红书预览使用同一个 PNG URL。
- 云端错误分支已验证：配置缺失 `API_CONFIG_MISSING`、数量不足 `API_BAD_JSON`、HTML 响应 `API_BAD_JSON`、坏 JSON `API_BAD_JSON`、HTTP 500 `API_HTTP_ERROR`、非 PNG `API_BAD_IMAGE`、空图片数据 `API_UNSUPPORTED_RESPONSE`、缺少 Prompt `BAD_REQUEST`。
- 右侧状态卡显示所选生成通道、云端 endpoint 摘要、耗时和错误码；`commandPreview` 不回显 API Key。
- Browser QA 跑通：搜索、勾选入库、缺配置提示、云端生成选题、云端生成文案、云端生成 Prompt、云端生成封面图。
- 页面不是空白页，无 Vite / React 错误覆盖层，Console `error` / `warn` 为 0。
- `1440x900` 和 `1440x720` 下整页不纵向滚动；`.sidebar`、`.workspace`、`.config-rail` 均保持独立滚动容器。
- 本地 Codex 文本 route 重新 smoke：`POST /api/codex/generate` 返回 10 个选题，耗时约 46s。
- 本地 PNG 发布函数的 `imagePath` 分支已用临时 PNG 验证；本轮未重新触发完整 600s Codex imagegen worker，完整本地 imagegen 链路沿用上一轮真实验收记录。

### 2026-06-27 本地 Codex CLI 与 imagegen PNG

验证环境：

- 命令：`npm run build`
- API：`POST /api/codex/generate` 和 `POST /api/codex/cover-image` 真实 Codex CLI smoke test
- 浏览器：in-app Browser QA；Playwright 固定视口截图
- URL：`http://127.0.0.1:5178/`（5173、5177 已被占用，本轮使用 5178）
- 视口：in-app Browser 当前视口

已验证：

- HTML 入口标题为 `青柠工作台 / Lime Desk`，不再保留 `Prototype` 标题。
- 生产构建可以完成。
- 本地 API smoke test 成功：`/api/codex/generate` 通过 Codex CLI 返回 10 个结构化选题，耗时约 44s。
- 本地封面图 API smoke test 成功：`/api/codex/cover-image` 通过 Codex CLI imagegen worker 返回 `/generated/covers/*.png`，PNG 托管响应 200，PNG signature 正确，文件大小约 2.27MB，耗时约 99s。
- 页面不是空白页，无 Vite / React 错误覆盖层。
- Console `error` / `warn` 为 0。
- 1440x900 下保持 3 列工作台，无横向溢出。
- 1440x720 下整页不纵向滚动，左侧保存入口、右侧错误覆盖和中间底部封面区均可在各自栏内滚动访问。
- 3 栏独立滚动已验证：`body`、`html`、`.app-shell` 不产生纵向滚动，`.sidebar`、`.workspace`、`.config-rail` 各自 `overflow-y: auto` 并响应本栏滚轮。
- 本轮 UI polish 重点：顶部指标卡完整露出、左侧身份标签不换行、滚动条降噪、空状态收紧、右侧模型配置表单减重。
- 页面主流程可点击推进：搜索、勾选入库、通过 Codex CLI 生成 10 个选题、通过 Codex CLI 生成 5 篇文案、通过 Codex CLI 生成 5 份 Prompt、点击 Prompt 生成 PNG 封面图。
- 前端封面图链路已验证：封面结果和小红书预览都切换到同一个 `/generated/covers/*.png`，图片自然尺寸有效，进度达到 100%，原始 Prompt 保留。
- 右侧状态卡显示 Codex CLI 执行中、成功、命令摘要和耗时。
- 当时云端 API 仍处于保留入口状态，点击后显示明确提示且不发起云端请求。
- API 错误分支已验证：缺少 RAG 返回 `BAD_REQUEST`，CLI 路径不可用返回 `CODEX_UNAVAILABLE`，非 JSON 输出解析返回 `CODEX_BAD_JSON`，缺少 Prompt 返回 `BAD_REQUEST`，imagegen worker 未写结果返回 `IMAGEGEN_BAD_OUTPUT`。`CODEX_TIMEOUT` 为 600s 超时保护分支，本轮未强制等待触发。
- 封面 Prompt 边界已加固：Prompt 生成要求包含“明确排除真人、脸、手和动物”，校验兼容常见中英文边界表达。
- 新版 Codex CLI 文本与 imagegen PNG 封面图边界已写入 `docs/SPEC.md`。
- `AGENTS.md`、`README.md`、`docs/VERIFICATION.md` 已同步到本地 Codex CLI 文本与封面图生成流程。

## 后续注意

- 视觉或布局改动后，至少重新执行 `npm run build`。
- 浏览器 QA 时必须检查页面不是空白页、无 Vite / React 错误覆盖层、Console `error` / `warn` 为 0。
- 涉及 `xiaohongshu-cli`、搜索、RAG 入库或生成链路时，必须检查用户主动触发和确认边界。
- 截图证据默认作为临时 QA 产物，不需要提交到仓库，除非用户明确要求。
