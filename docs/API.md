# Mint Atelier API 契约（前后端分离）

> 本文件是前端（`.planning/2026-09-11-xhs-frontend/`）与后端（`.planning/2026-09-11-xhs-backend/`）两个并行对话的**唯一接口事实源**。
> 修改契约的对话必须同步更新本文件，并在自己的 progress.md 记录变更，通知对方。

## 0. 基础约定

| 项 | 值 |
|----|----|
| 后端地址 | `http://127.0.0.1:52881`（固定端口；后端进程默认监听该端口，本地自测可用环境变量 `MINT_BACKEND_PORT` 临时覆盖） |
| 前端地址 | `http://127.0.0.1:52880`（Vite 静态，固定端口） |
| CORS | 后端允许来源 `http://127.0.0.1:52880`；`OPTIONS` 预检返回 204；允许方法 `GET, POST, OPTIONS`；允许头 `Content-Type` |
| 请求体上限 | 2 MB（已生效，容纳整项目保存；超出返回 `BAD_REQUEST` 请求体过大） |
| 生成目录 | 图片持久化在项目内 `data/generated/`，URL 仍为 `/generated/covers/<fileName>`（由后端托管） |
| 数据目录 | `data/workspace.json`（工作区持久化）；`output/`（导出产物）；两者均已 gitignore |

**统一响应包裹**：成功 `{ok:true, ...}`；失败 `{ok:false, code, error, details?}` + 对应 HTTP 状态码（4xx/5xx）。前端 `requestJson` 依赖 `ok` 布尔与 `code`/`error`/`details` 字段，此协议不变。

**路由配置段**（各通道请求体末尾追加，前端由模型配置生成）：

- 本地 CLI 通道：`{ "cliId": "codex|kimi|claude|custom", "cliCommand": "custom时的命令或绝对路径", "modelName": "可空" }`
- 云端通道：`{ "modelName": "必填", "apiKey": "必填", "baseUrl": "必填，OpenAI 兼容根地址" }`

## 1. 现有端点（已实现，行为保持不变）

### 1.1 小红书搜索

`POST /api/xhs/search`

```jsonc
// 请求
{ "keyword": "夏日通勤穿搭", "sort": "general|popular|latest", "type": "all|video|image", "page": 1 }  // sort/type/page 可省略，默认 popular/all/1；page 1..20
// 响应
{ "ok": true, "kind": "xhsSearch", "items": [ {
  "id": "xhs-1-1-<noteId>", "title": "...", "excerpt": "...", "tags": ["..."],
  "metrics": "赞 1.2万 | 藏 3456 | 评 789", "source": "search_result/<noteId>",
  "noteId": "...", "noteType": "image|video", "author": "...", "keyword": "...", "lookupTime": "09-11 14:30"
} ], "hasMore": false, "commandPreview": "xhs ...", "durationMs": 1234, "generatedAt": "ISO" }
```

错误码：`XHS_AUTH_REQUIRED`(401 未登录，提示 `xhs login`)、`XHS_VERIFY_REQUIRED`(429)、`XHS_RATE_OR_IP_BLOCKED`(429)、`XHS_CLI_UNAVAILABLE`(503 未安装)、`XHS_BAD_JSON`(502)、`XHS_FAILED`(502)、`XHS_FAILED`(504 超时)。

### 1.2 文本生成（三条通道同构）

`POST /api/codex/generate` | `/api/local-cli/generate` | `/api/cloud/generate`

```jsonc
// 请求（公共部分 + 路由配置段）
{
  "kind": "topics|drafts|coverPrompts|imageSetPlan",   // imageSetPlan 见 §2.1
  "persona": "...", "keyword": "...",
  "ragItems": [ { "id","title","excerpt","tags","metrics","source", ... } ],  // 非空必填
  "writingBrief": "...",                                // drafts 必填（前端必传）
  "selectedTopic": { "title", "angle", ... },           // drafts 必填
  "selectedDraft": { "title", "body", "coverDirection" }, // coverPrompts 必填
  // imageSetPlan 专有：
  "innerCount": 4,                                      // 2..6，默认 4；items 总数 = 1 + innerCount
  ...路由配置段
}
// 响应
{ "ok": true, "kind": "<同请求>", "items": [ ... ], "raw": "...", "commandPreview": "...", "durationMs": 123, "generatedAt": "ISO" }
```

items 结构随 kind：

- `topics`（恰好 10 条）：`{id:"topic-N", title, angle, audience, reason, hook}`
- `drafts`（恰好 5 条）：`{id:"draft-N", title, body(含 #话题[话题]#), coverDirection, topicTitle}`
- `coverPrompts`（恰好 5 条，**旧版保留兼容，前端已下线**）：`{id:"prompt-N", title, prompt}`
- `imageSetPlan`：见 §2.1

### 1.3 模型决策（自动化流程用）

`POST /api/codex/decide` | `/api/local-cli/decide` | `/api/cloud/decide`

```jsonc
// 请求
{ "decisionKind": "rag|topic|draft|coverPrompt", "persona","keyword","writingBrief",
  "ragItems": [...], "options": [ { "id","title","excerpt|body|prompt|angle", ... } ],  // ≤30 条，每条必须有唯一 id
  "selectedTopic?": {...}, "selectedDraft?": {...}, ...路由配置段 }
// 响应
{ "ok": true, "kind": "decision", "decisionKind": "...", "selectedIds": ["id"], "reason": "...",
  "raw","commandPreview","durationMs","generatedAt" }
```

约束：`rag` 返回 1..8 个 id；其余返回恰好 1 个 id。id 必须来自 options。

### 1.4 本机 CLI 检测

`POST /api/local-cli/detect`

```jsonc
// 请求
{ "customCommand": "" }   // 文案通道为 custom 时传命令名/绝对路径，否则空
// 响应
{ "ok": true, "kind": "localCliDetection", "clis": [ {
  "id": "codex|kimi|claude|custom", "label": "...", "description": "...",
  "capabilities": { "text": true, "image": false },   // 仅 codex image=true
  "available": true, "version": "x.y", "error?": "...", "commandPreview": "..."
} ], "generatedAt": "ISO" }
```

### 1.5 单张图片生成（整套配图逐张复用）

`POST /api/codex/cover-image` | `/api/local-cli/cover-image`（仅 codex 可 image） | `/api/cloud/cover-image`

```jsonc
// 请求（公共部分 + 图片路由配置段）
{ "persona": "...", "keyword": "...",
  "selectedDraft": { "title": "...", ... },             // 必填
  "selectedPrompt": { "title": "...", "prompt": "..." }, // 必填；整套配图时 prompt 已由前端拼接 styleGuide
  ...路由配置段 }
// 响应
{ "ok": true, "kind": "coverImage",
  "image": { "src": "/generated/covers/cover-<ts>-<uuid>.png", "title": "...", "alt": "...",
             "fileName": "cover-<ts>-<uuid>.png", "mimeType": "image/png", "byteLength": 123456 },
  "raw","commandPreview","durationMs","generatedAt" }
```

### 1.6 图片静态托管

`GET /generated/covers/<fileName>` → `image/png`。文件名必须匹配 `cover-\d+-[a-f0-9-]+\.png`。由后端进程直接托管（持久化目录 `data/generated/`，前端用 `${API_BASE}/generated/covers/...` 拼绝对地址）。

## 2. 新增端点（本次迭代）

### 2.1 整套配图方案 `imageSetPlan`（走 §1.2 generate 通道，后端 B3）

```jsonc
// 响应 items（1 + innerCount 条，首条 role 固定 cover）
{ "ok": true, "kind": "imageSetPlan",
  "styleGuide": "统一视觉规范：色调/材质/构图/光线/比例(4:5)...",
  "items": [
    { "id": "img-1", "role": "cover", "title": "...", "prompt": "... 明确排除真人、脸、手和动物。" },
    { "id": "img-2", "role": "inner", "title": "...", "prompt": "..." }
  ], "raw","commandPreview","durationMs","generatedAt" }
```

服务端校验：`styleGuide` 非空；首条 `role==="cover"`；每条 prompt 含「真人/人物…脸…手…动物」四类排除表述（复用现有 `normalizePrompt` 边界校验）；数量精确等于 `1 + innerCount`。

### 2.2 工作区持久化 store（后端 B2）

存储结构（`data/workspace.json`）：

```jsonc
{ "version": 1, "activeProjectId": "proj-...",
  "projects": [ {
    "id": "proj-<ts>-<rand>", "title": "关键词 @ MM-DD HH:mm",
    "persona": "...", "keyword": "...", "writingBrief": "...",
    "ragItems": [...], "searchResults": [...],
    "topics": [...], "selectedTopicId": "topic-1",
    "drafts": [...], "selectedDraftId": "draft-1",
    "imageSet": { "styleGuide": "...", "items": [ { "id","role","title","prompt","image": {image 对象, 可空} } ] },
    "images": [ { "src","title","alt","fileName","mimeType","byteLength" } ],
    "createdAt": "ISO", "updatedAt": "ISO"
  } ] }
```

服务端规范化规则（B2 已实现）：

- 允许的 project 字段即上方列表（`images` 为可选数组，与 `imageSet.items[].image` 同构）；**列表外字段丢弃**
- 缺 `id` 时服务端生成 `proj-<ts>-<rand>`；缺 `title` 时按 `关键词 @ MM-DD HH:mm` 生成；`createdAt` 首次写入时落库，`updatedAt` 每次 saveProject 由服务端刷新
- `imageSet` 规范化为 `{styleGuide, items:[{id,role,title,prompt,image}]}`，`role` 非 `cover` 一律按 `inner` 处理，`image` 缺失为 `null`
- 删除的 `projectId` 正好是 `activeProjectId` 时，服务端把 `activeProjectId` 置空（前端可再调 `setActive`）

`GET /api/store` → `{ "ok": true, "workspace": {…上述结构…} }`

`POST /api/store`（三选一 action）：

```jsonc
{ "action": "saveProject",    "project": {…完整 project 对象…} }   // upsert，按 id 覆盖，服务端刷新 updatedAt
{ "action": "deleteProject",  "projectId": "proj-..." }
{ "action": "setActive",      "projectId": "proj-..." }
// 响应统一：{ "ok": true, "workspace": {…更新后的完整 workspace…} }
```

实现要求：原子写（tmp + rename）；文件损坏时把坏文件改名保留（`workspace.json.broken-<ts>`）并返回空工作区；project 字段做类型校验（字符串/数组），未知字段丢弃。

### 2.3 笔记导出（后端 B4）

`POST /api/export`

```jsonc
// 请求
{ "projectId": "proj-...", "title": "笔记标题", "body": "正文（含 #话题[话题]#）",
  "tags": ["话题1", ...],
  "imageSet": { "styleGuide": "...",
    "items": [ { "id","role","title","prompt","image": { "fileName": "cover-....png", ... } } ] } }
// 响应
{ "ok": true, "exportDir": "<repoRoot>/output/<slug>", "files": ["note.md", "images/cover-....png", ...] }
```

服务端行为：导出目录 `output/<项目slug>/`（slug 由 projectId+时间生成，避免重名覆盖）；`note.md` 含标题、正文、话题清单、配图说明（每张的 role/title/prompt 摘要）；把请求中出现的 `image.fileName` 从 `data/generated/` 拷贝到 `output/<slug>/images/`；fileName 不存在时跳过并在响应 `skipped` 数组中列出（字段可空）。

## 3. 前端调用约定（对话 B 遵守）

- `src/codexClient.js` 统一 `API_BASE`（localStorage `mint-atelier-v2:apiBase` 可覆盖，默认 `http://127.0.0.1:52881`），所有路径拼 `${API_BASE}/api/...` 与 `${API_BASE}/generated/covers/...`
- fetch 网络层失败（TypeError）时抛出「后端未启动（127.0.0.1:52881）」可理解提示
- 图片 `<img src>` 使用绝对地址（分离后相对路径不再指向后端）
- 契约外字段容错：忽略响应里的附加字段（如 export 的 `slug`、project 的 `images`）；空工作区的 `activeProjectId: ""` 前端按「无激活项目」处理
- 整套配图出图时由前端把 `styleGuide` 拼在每条 prompt 之前，作为 `selectedPrompt.prompt` 与 `prompt` 一起发送；服务端不需要感知 styleGuide
- 导出请求的 `tags` 由前端从文案正文的 `#话题[话题]#` 解析得到；缺失图片由服务端返回在 `skipped`

## 4. 变更记录

| 日期 | 变更 | 提出方 |
|------|------|--------|
| 2026-09-11 | 初版：固化现有 9 端点 + 新增 imageSetPlan / store / export | 规划会话 |
| 2026-09-14 | B1+B2 落地：后端独立进程 `server/index.mjs` 监听 52881（可用 `MINT_BACKEND_PORT` 覆盖）；请求体上限 2 MB 生效；`/api/store` 实现细节补充（可选 `images` 字段、缺 id/title 时服务端生成、删除激活项目后 `activeProjectId` 置空、`imageSet` 规范化） | 后端对话 |
| 2026-09-14 | 前端 F1~F4 落地后补充 §3 前端侧约定（附加字段容错、`""` 归一化、styleGuide 拼接位置、tags 解析），接口语义未变更 | 前端对话 |
