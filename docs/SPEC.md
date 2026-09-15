# 小红书 AI 助理产品规格

## 1. 产品目标

`青柠工作台 / Lime Desk` 是一个桌面端 Web App，用于帮助用户生成优质小红书内容。用户输入账号人设、创作关键词和撰写思路后，可以参考热门内容，逐步生成小红书选题、小红书文案、整套配图方案和整套配图（1 张封面 + 3~7 张内页），也可以点击“自动化生成”串行完成核心创作流程，并把完成的笔记连同图片导出到本机。

产品核心目标是让用户通过简单流程完成从「关键词」到「可发布内容草稿」的创作过程。本产品只做内容创作辅助，不做自动发布、自动点赞、自动评论、自动收藏、自动关注等平台操作。

当前版本的前后端是两个独立进程：后端 API 服务监听 `127.0.0.1:52881`，前端静态站点监听 `127.0.0.1:52880`，接口契约以 `docs/API.md` 为准。工作区数据持久化在服务端 `data/workspace.json`，图片持久化在 `data/generated/`，导出产物写入 `output/`。

当前版本的热门内容搜索通过本机 `xhs` CLI 执行。选题、文案、整套配图方案和模型决策支持本地可选 CLI（内置 Codex CLI、Kimi CLI、Claude Code，并允许符合统一 print protocol 的自定义 CLI）与云端 OpenAI-compatible API；PNG 图片支持本地 Codex CLI native imagegen 与云端 Images-compatible API。搜索结果不会后台自动进入 RAG；RAG 入库需要用户手动勾选确认，或用户点击“自动化生成”后由文案生成模型在本次流程中选择参考内容。

## 2. 核心流程

1. 用户手动输入账号人设。
2. 用户输入创作关键词。
3. 用户点击搜索，获取小红书热门内容。
4. 用户从搜索结果中选择有参考价值的内容，并加入本地 RAG 知识库。
5. AI 基于人设、关键词和参考内容生成 10 个选题。
6. 用户选择一个选题。
7. 用户补充简要撰写思路。
8. AI 基于选题和撰写思路生成 5 篇文案。
9. 用户选择一篇文案。
10. AI 基于所选文案生成整套配图方案：一份统一视觉规范，加 1 张封面和若干张内页（默认 4 张内页，可选 2~6 张）。
11. 用户点击方案中的任意一张，生成对应图片；单张可重新生成。
12. 用户可以保存项目，并把笔记导出到本机 `output/<项目slug>/`。

自动化流程：用户填写账号人设、创作关键词和撰写思路后，点击“自动化生成”，系统视为用户对本次串行流程的完整确认，并自动完成热门搜索、模型选择参考内容并入库、生成并选择选题、生成并选择文案、生成整套配图方案、调用图片模型生成整套配图。自动化过程中所有选择结果仍需要在页面中保留可见选中态。

## 3. 功能需求

### 3.1 人设输入

用户可以手动输入账号人设。人设用于约束后续选题、文案和封面 Prompt 的生成方向。人设是一段字符串，最多支持 1000 字，需要自动缓存。

### 3.2 关键词输入

用户可以输入创作关键词。关键词用于搜索热门内容，也用于辅助生成选题和文案。关键词需要自动缓存。

### 3.3 热门内容搜索

用户可以点击搜索按钮，通过本机 `xhs` CLI 获取与关键词相关的小红书热门内容。默认通过系统 PATH 查找 `xhs` 执行 `xhs --cookie-source none search "<关键词>" --sort popular --type all --page 1 --json`，可通过 `XHS_CLI_COMMAND` 和 `XHS_COOKIE_SOURCE` 覆盖。搜索必须由用户点击“搜索热门内容”或“自动化生成”触发，失败时需要显示明确、可理解的错误提示。

服务端只消费 `xhs` 的结构化 JSON 输出，并返回归一化后的搜索项；不得把原始 CLI 输出、Cookie 或 `xsec_token` 返回给浏览器。

搜索结果需要展示：

- 标题
- 摘要或正文片段
- 标签
- 互动数据
- 来源链接或 note id
- 检索关键词
- 检索时间

### 3.4 加入 RAG 知识库

用户可以从热门内容搜索结果中勾选内容，并加入本地 RAG 知识库。用户点击“自动化生成”时，文案生成模型可以从搜索结果中选择 1 到 8 条参考内容并入库，页面需要同步勾选这些内容。系统不得后台自动入库，也不得静默将全部搜索结果加入 RAG。RAG 内容用于辅助生成选题和文案，并需要保存在本地。

### 3.5 生成选题

用户点击生成选题后，AI 生成 10 个小红书选题。生成选题时需要参考用户人设、创作关键词和 RAG 知识库内容。

在自动化流程中，AI 生成 10 个选题后，文案生成模型需要从候选中选择 1 个选题继续后续步骤。

每个选题建议包含：

- 标题
- 选题角度
- 目标受众
- 推荐理由
- 内容爆点

### 3.6 撰写思路输入

用户选择选题后，可以补充简要撰写思路。撰写思路是一段字符串，需要自动缓存。

### 3.7 生成文案

用户点击生成文案后，AI 生成 5 篇小红书文案。生成文案时需要参考用户人设、用户选择的选题、用户补充的撰写思路和 RAG 知识库内容。

在自动化流程中，AI 生成 5 篇文案后，文案生成模型需要从候选中选择 1 篇继续后续步骤。

每篇文案建议包含：

- 标题
- 正文
- 封面方向建议

正文是字符串，正文包含话题标签。小红书话题标题格式是 `#话题名称[话题]#`。

### 3.8 生成整套配图方案

用户选择文案后，AI 生成一整套配图方案：一份统一视觉规范（`styleGuide`，涵盖色调、材质、构图、光线和 4:5 比例），以及 `1 + innerCount` 条图片方案。第一条固定是封面（`role` 为 `cover`），其余是内页（`role` 为 `inner`）。`innerCount` 默认 4，可取 2~6，因此方案总数在 3~7 条之间；每条方案包含标题和图片 Prompt。

为了避免图片被识别为 AI 生成，每条 Prompt 都必须明确排除真人、脸、手和动物，可以使用植物或花材作为辅助元素。服务端会校验方案数量、首条角色、`styleGuide` 是否存在，以及每条 Prompt 是否包含排除边界，不满足时返回明确错误。

在自动化流程中，AI 生成整套配图方案后，文案生成模型需要选出封面用于首张图片生成。

旧版「生成 5 份封面 Prompt」（`kind: "coverPrompts"`）接口保留兼容，但不再作为主流程。

### 3.9 生成配图

用户点击方案中的任意一条后，系统按图片模型配置生成对应 PNG 图片。本地路线通过 Codex CLI worker 调用 native `image_gen.imagegen`；云端路线通过 OpenAI-compatible `POST /images/generations` 生成图片。两条路线都需要把生成结果展示在页面中。图片文件持久化在后端 `data/generated/`，由后端进程托管在 `/generated/covers/*.png`，服务重启后仍然可用。生成失败时，需要保留原始 Prompt，方便用户重新生成。

### 3.10 模型配置

文案生成模型和图片生成模型需要支持单独配置。用户可以选择本地 CLI 或云端 API。本地文案 CLI 由服务端注册表提供，页面通过用户主动点击“检测本机 CLI”执行 `--version` 检测并展示可用状态，禁止后台检测。内置适配器包括：

- Codex CLI：通过 `codex exec` 生成文本和模型决策，也可通过 native `image_gen.imagegen` 生成本地 PNG；默认从 PATH 查找，可用 `CODEX_CLI_PATH` 覆盖。
- Kimi CLI：通过 `kimi --prompt <prompt> --output-format stream-json` 生成文本和模型决策，可选 `--model <alias>`；默认从 PATH 查找，可用 `KIMI_CLI_PATH` 覆盖。Kimi CLI 当前不声明图片生成能力，因此不会出现在本地图片 CLI 选项中。
- Claude Code：通过 `claude --print <prompt> --output-format json` 生成文本和模型决策，可选 `--model <alias>`；调用时启用 safe mode、关闭工具和会话持久化，解析响应的 `result` 字段。默认从 PATH 查找，可用 `CLAUDE_CLI_PATH` 覆盖。Claude Code 当前不声明图片生成能力，因此不会出现在本地图片 CLI 选项中。
- 自定义规范 CLI：用户可填写 PATH 中的命令名或可执行文件绝对路径。服务端使用 `shell: false` 和独立参数数组启动，不允许 shell 命令片段。

Lime Desk print protocol 规定：CLI 必须支持 `--version`；文本调用必须支持可选的 `--model <alias>`、必填的 `--prompt <prompt>` 和 `--output-format stream-json`；stdout 采用逐行 JSON，每次最终回复至少包含一条 `{"role":"assistant","content":"<valid JSON>"}`，其中 `content` 是满足当前任务结构的 JSON 字符串。stderr 可输出思考或进度，但不得承载最终结果。新增本地 CLI 也可以通过实现 `server/localCli/registry.mjs` 的适配器接口接入其他调用规范。

本地 CLI 返回文案和封面 Prompt 时，服务端兼容约定字段的常见英文、snake_case 与中文别名。文案的 `coverDirection` 完全缺失时，服务端根据文案标题补充静物封面方向；其他必需内容、数量和话题标签仍保持强校验。本地 CLI 的结构化输出错误统一使用 `LOCAL_CLI_BAD_JSON`。

云端文本路线走 OpenAI-compatible `POST /chat/completions`，云端图片路线走 Images-compatible `POST /images/generations`。当文本 API Base URL 指向 Kimi 官方 `api.moonshot.cn`、`api.moonshot.ai` 或 Kimi Code 会员接口 `api.kimi.com/coding` 时，服务端使用 Kimi 兼容参数：不固定传入 `temperature`，让不同模型使用各自支持的默认值；输出长度使用 `max_completion_tokens`，并请求 `json_object` 输出。云端上游的 HTTP 错误需要保留状态码并展示供应商返回的具体原因，但不得泄露 API Key。

用户至少可以分别配置：

- 文案生成使用的模型
- 图片生成使用的模型
- API Key
- API Base URL
- 模型名称

模型配置需要自动缓存。

### 3.11 模型决策

自动化流程中的 RAG 参考选择、选题选择、文案选择和封面 Prompt 选择都使用当前文案生成模型。决策接口包括通用本地 CLI 路线 `POST /api/local-cli/decide`、保留兼容的 Codex CLI 路线 `POST /api/codex/decide` 和云端 OpenAI-compatible 路线 `POST /api/cloud/decide`。

决策请求需要包含 `decisionKind`、`persona`、`keyword`、`writingBrief`、`ragItems`、`options`，并在需要时包含 `selectedTopic` 或 `selectedDraft`。决策响应固定返回 `kind: "decision"`、`decisionKind`、`selectedIds`、`reason`、`commandPreview`、`durationMs` 和 `generatedAt`。

服务端必须校验模型返回的 ID 来自候选项：RAG 决策必须返回 1 到 8 个候选项 ID，选题、文案和封面 Prompt 决策必须且只能返回 1 个候选项 ID。无效 ID、重复 ID、空选或数量不合法时，需要返回明确错误并停止自动化流程。

### 3.12 错误提示

以下情况需要显示明确错误提示，并尽量告诉用户下一步该怎么做：

- 搜索失败
- RAG 加入失败
- 选题生成失败
- 文案生成失败
- 整套配图方案生成失败
- 配图生成失败
- 导出失败
- 模型决策失败
- 自动化生成中断
- 模型配置缺失
- API Key 无效
- 本地 CLI 不可用
- xhs CLI 未安装、未登录、需要验证、频率或网络受限、返回非 JSON 内容
- 本地 CLI 未安装、能力不匹配、执行失败、超时或返回非规范 JSONL/JSON 内容
- Codex CLI imagegen 失败或写出非 PNG 内容
- 云端 API 配置缺失、Base URL 无效、HTTP 错误、超时、返回非 JSON、返回结构不支持或返回非 PNG 图片
- 网络请求失败

### 3.13 工作区持久化

工作区数据由后端服务保存到 `data/workspace.json`，包含全部项目：人设、关键词、撰写思路、RAG 引用、搜索结果、选题与所选选题、文案与所选文案、整套配图方案（视觉规范与每条 Prompt、图片引用）及时间戳。写入使用临时文件加改名的原子方式，避免中途中断损坏文件；文件无法解析时改名为 `workspace.json.broken-<时间戳>` 保留现场并重建空工作区。除工作区数据外，服务端不保存 Cookie、API Key 等敏感信息（模型配置仍在浏览器 `localStorage`）。

### 3.14 笔记导出

用户可以把某个项目导出到本机：后端在 `output/<项目slug>/` 下写入 `note.md`（标题、正文、话题清单、统一视觉规范、配图清单与每张图的 Prompt 说明），并把该项目已生成的 PNG 从 `data/generated/` 拷贝到 `output/<slug>/images/`。导出目录名由项目 id 加时间戳组成，重复导出不会互相覆盖；请求中引用但实际不存在的图片会被跳过，并在响应 `skipped` 中列出。
