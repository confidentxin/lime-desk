# 薄荷工坊 / Mint Atelier

`薄荷工坊 / Mint Atelier` 是一个 React + Vite 桌面端 Web App，用于辅助生成小红书内容草稿。当前设计稿以阶段式工作台表达完整流程：人设和关键词输入、热门内容搜索、加入本地 RAG、生成选题、生成文案、生成封面 Prompt、生成封面图。

项目保持 3 列内容创作工作台形态，并保留 Pastel 3D Claymorphism 视觉方向。当前链路支持本机 `xhs` CLI 热门搜索、本地 Codex/Kimi/Claude/自定义规范 CLI 文本生成、Codex 本地图片生成，以及云端 OpenAI-compatible API 生成；RAG 入库支持用户手动勾选确认，也支持用户点击“自动化生成”后由文案模型选择参考内容并入库。

## 预览

![薄荷工坊桌面工作台预览](public/assets/mint-atelier-preview.jpg)

## 本地运行

应用是前后端分离的两个进程：后端 API 服务监听 `http://127.0.0.1:52881`（接口契约见 `docs/API.md`），前端是纯静态 Vite 站点，运行在 `http://127.0.0.1:52880`。页面打开后所有请求都发往后端地址；后端未启动时页面仍可打开，操作会提示「后端服务未启动」。图片由后端进程托管在 `/generated/covers/*.png`，前端用后端地址拼出绝对 URL。

最省心的启动方式：

- macOS：双击 `启动薄荷工坊.command`
- Windows：双击 `启动薄荷工坊.bat`

脚本会先启动后端 52881，再启动前端 52880，缺少 `node_modules` 时会先执行 `npm install`，然后等待前端服务启动并自动打开浏览器。模型配置写入浏览器 `localStorage`，固定地址可以避免端口变化导致缓存读不到。

后端地址默认 `http://127.0.0.1:52881`，如需指向其他实例，可在浏览器控制台设置 `localStorage.setItem("mint-atelier-v2:apiBase", "http://127.0.0.1:端口")` 后刷新页面。

命令行启动同一个固定地址：

```bash
npm run launch:fixed
```

开发时如果不想每次启动前构建，可以使用：

```bash
npm run launch:dev
```

本地构建后预览：

```bash
npm run deploy:local
```

只启动后端 API（前端另开一个终端用 `npm run dev:fixed`）：

```bash
npm run server
```

临时启动开发服务器：

```bash
npm run dev
```

构建检查：

```bash
npm run build
```

本地 Codex CLI 默认通过系统 PATH 查找 `codex`，可通过环境变量覆盖：

```bash
CODEX_CLI_PATH=/path/to/codex npm run launch:fixed
```

Kimi CLI 默认通过系统 PATH 查找 `kimi`，可通过环境变量覆盖。首次使用前请在终端完成 `kimi login`；页面点击“检测本机 CLI”后会显示版本和可用状态：

```bash
KIMI_CLI_PATH=/path/to/kimi npm run launch:fixed
```

Claude Code 默认通过系统 PATH 查找 `claude`，可通过环境变量覆盖。首次使用前请在终端完成 `claude auth login`；适配器使用官方非交互 JSON 模式，并关闭工具调用和会话持久化：

```bash
CLAUDE_CLI_PATH=/path/to/claude npm run launch:fixed
```

右侧“文案生成”可以选择 Codex、Kimi、Claude，或填写符合 Mint Atelier print protocol 的自定义命令。自定义 CLI 需要支持 `--version`、`--prompt`、可选 `--model` 和 `--output-format stream-json`，最终 stdout 需包含 `{"role":"assistant","content":"<valid JSON>"}`。本地图片生成当前只显示具备 native imagegen 能力的 Codex CLI。

小红书热门搜索通过本机 `xhs` CLI 触发。该 CLI 来自 PyPI 包 `xiaohongshu-cli`（仓库 `github.com/jackwener/xiaohongshu-cli`），需要 Python 3.10+，推荐用 `uv` 或 `pipx` 安装：

```bash
uv tool install xiaohongshu-cli     # 或 pipx install xiaohongshu-cli
xhs status                          # 查看登录状态
xhs login --qrcode                  # 用小红书 App 扫码登录（也可 xhs login 从已登录浏览器读取 Cookie）
xhs --cookie-source none search "穿搭" --json   # 验证登录态与搜索输出
```

注意：npm 上的 `xhs-cli` 是另一个工具（创作者后台指标与发帖），没有 `search` 子命令，不要用它替代上面的包。

服务端默认通过系统 PATH 查找 `xhs`，默认只使用 CLI 已保存的登录态：

```bash
XHS_CLI_COMMAND=/path/to/xhs XHS_COOKIE_SOURCE=none npm run launch:fixed
```

如果搜索提示未登录，请先在终端运行 `xhs login` 或 `xhs login --qrcode`，再回到页面点击搜索。前端不会读取、展示或保存 Cookie。

## 本地数据与导出

- 工作区持久化：`data/workspace.json`。所有项目（人设、关键词、RAG 引用、选题、文案、整套配图方案与图片引用）都保存在这里，服务端用临时文件加改名的方式原子写入；文件损坏时会被重命名为 `workspace.json.broken-<时间戳>` 并重建空工作区，不会静默丢数据。接口见 `docs/API.md` 的 `/api/store`。
- 图片持久化：`data/generated/`。封面图与整套配图的 PNG 落在这里，重启后仍然可用，由后端托管在 `/generated/covers/<fileName>`。
- 导出产物：`output/<项目slug>/`，包含 `note.md`（标题、正文、话题清单、统一视觉规范、配图清单与每张图的 Prompt 说明）和 `images/`（从 `data/generated/` 拷贝的 PNG）。导出不存在的图片会被跳过并在响应 `skipped` 中列出。
- `data/` 与 `output/` 均已加入 `.gitignore`。

云端 API 路线在右侧模型配置中填写：模型名称、API Key、API Base URL。文案生成走 `POST /chat/completions`，图片生成走 `POST /images/generations`，服务端会把图片结果统一校验并发布为 `/generated/covers/*.png`。

## 文档入口

- `docs/SPEC.md`：详细产品规格和完整核心流程。
- `AGENTS.md`：项目契约、边界、实现地图和修改规则。
- `docs/DESIGN.md`：视觉系统、布局规则和资产风格。
- `docs/VERIFICATION.md`：构建、截图和交互验证清单。
- `docs/QA_LOG.md`：最近视觉 QA 记录和当前状态。

## 当前项目状态

- 左侧：品牌、创作者资料、创作流程、草稿项目、保存入口。
- 中间：概览、人设关键词、热门搜索、RAG 入库、选题候选、撰写思路、文案候选、小红书预览、封面 Prompt 和 PNG 封面图结果。
- 右侧：文案模型配置、本机 CLI 选择与主动检测、图片模型配置、生成通道状态、错误提示、错误覆盖检查。
- 本地 React state 驱动流程推进、结果选择、错误提示和封面图展示；人设、关键词、撰写思路和模型配置会写入 `localStorage`。

核心边界：搜索、RAG 入库、文本生成和封面图生成都必须由用户主动点击触发；“自动化生成”只代表本次点击授权串行完成搜索、模型决策入库、生成与封面图生成，不做后台轮询。当前不做自动发布、自动点赞、自动评论、自动收藏、自动关注、自动私信或自动批量采集。
