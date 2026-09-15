import { useEffect, useMemo, useRef, useState } from "react";
import { STORAGE_PREFIX } from "./storageKeys.js";
import {
  requestCloudCoverImage,
  requestCloudDecision,
  requestCloudGeneration,
  requestLocalCliCoverImage,
  requestLocalCliDecision,
  requestLocalCliDetection,
  requestLocalCliGeneration,
  requestExport,
  requestStoreLoad,
  requestStoreSave,
  requestXhsSearch,
  resolveAssetUrl,
} from "./codexClient.js";

const defaultPersona = "26 岁轻熟风穿搭博主，分享通勤、周末出行和约会搭配。表达温柔具体，重点放在真实穿着体验、单品组合和可复用公式。";
const defaultKeyword = "夏日通勤穿搭";
const defaultBrief = "创作上班族可收藏实用穿搭内容，核心突出清爽利落、提气色不闷汗，口吻贴近闺蜜走心分享。";

const defaultModelConfig = {
  text: {
    provider: "local",
    cliId: "codex",
    cliCommand: "",
    modelName: "Codex CLI / gpt-5-codex",
    apiKey: "",
    baseUrl: "",
  },
  image: {
    provider: "local",
    cliId: "codex",
    cliCommand: "",
    modelName: "Codex CLI / imagegen skill",
    apiKey: "",
    baseUrl: "",
  },
};

const defaultLocalClis = [
  {
    id: "codex",
    label: "Codex CLI",
    description: "Codex 原生非交互模式",
    capabilities: { text: true, image: true },
    available: null,
    commandPreview: "codex exec ...",
  },
  {
    id: "kimi",
    label: "Kimi CLI",
    description: "Kimi Code CLI stream-json 模式",
    capabilities: { text: true, image: false },
    available: null,
    commandPreview: "kimi --prompt ... --output-format stream-json",
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "Claude Code 非交互 JSON 模式",
    capabilities: { text: true, image: false },
    available: null,
    commandPreview: "claude --print ... --output-format json",
  },
  {
    id: "custom",
    label: "自定义规范 CLI",
    description: "支持 --prompt、--model 与 stream-json 输出",
    capabilities: { text: true, image: false },
    available: null,
    commandPreview: "[cli] --prompt ... --output-format stream-json",
  },
];

const flowSteps = [
  { id: "input", label: "人设关键词", meta: "账号约束" },
  { id: "research", label: "热门搜索", meta: "手动触发" },
  { id: "rag", label: "RAG 入库", meta: "勾选确认" },
  { id: "topics", label: "生成选题", meta: "10 个候选" },
  { id: "drafts", label: "生成文案", meta: "5 篇草稿" },
  { id: "cover", label: "配图生成", meta: "方案到整套图" },
];

const generationLabels = {
  topics: "选题",
  drafts: "文案",
  imageSetPlan: "配图方案",
};

const decisionLabels = {
  rag: "RAG 参考",
  topic: "选题",
  draft: "文案",
};

const errorMessages = {
  search: "搜索失败：请确认关键词不为空，并检查 xhs CLI 登录状态或网络状态后重试。",
  rag: "RAG 加入失败：请先勾选至少一条搜索结果，再点击加入本地知识库。",
  topics: "选题生成失败：请补充人设、关键词，并至少加入一条参考内容。",
  drafts: "文案生成失败：请先选择一个选题，并补充必要的撰写思路。",
  prompts: "配图方案生成失败：请先选择一篇文案。",
  image: "整套配图生成失败：请先选择一篇文案，并检查图片模型配置后重试。",
  config: "模型配置缺失：云端 API 需要填写 API Key、API Base URL 和模型名称。",
  key: "API Key 无效：请检查密钥是否完整，或切换到本地 CLI 运行方式。",
  cli: "本地 CLI 不可用：请先检测并选择已安装、已登录且支持当前能力的 CLI。",
  network: "网络请求失败：请检查代理、API Base URL 或稍后重试。",
};

function useStoredState(key, initialValue) {
  const storageKey = `${STORAGE_PREFIX}:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      return storedValue ? JSON.parse(storedValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

function nowText() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function isCloudPlaceholderModel(value) {
  return /codex\s*cli|imagegen\s*skill|本地\s*cli/i.test(String(value ?? ""));
}

function SoftIcon({ children, tone = "lime" }) {
  return <span className={`soft-icon ${tone}`}>{children}</span>;
}

function StageBadge({ children, tone = "lime" }) {
  return <span className={`stage-badge ${tone}`}>{children}</span>;
}

function SectionHeader({ icon, tone = "lime", title, meta, action }) {
  return (
    <header className="section-header">
      <div>
        <SoftIcon tone={tone}>{icon}</SoftIcon>
        <span>
          <h2>{title}</h2>
          {meta ? <p>{meta}</p> : null}
        </span>
      </div>
      {action}
    </header>
  );
}

function ProviderSwitch({ value, onChange }) {
  return (
    <div className="provider-switch">
      {[
        ["local", "本地 CLI"],
        ["cloud", "云端 API"],
      ].map(([provider, label]) => (
        <button
          key={provider}
          className={value === provider ? "selected" : ""}
          onClick={() => onChange(provider)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ModelConfig({
  channel,
  title,
  tone,
  icon,
  value,
  onChange,
  localClis,
  detectionState,
  onDetect,
}) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  const selectedCliId = value.cliId || "codex";
  const selectedCli = localClis.find((item) => item.id === selectedCliId) || localClis[0];
  const availableClis = localClis.filter((item) => item.capabilities?.[channel]);
  const localDescription = selectedCli
    ? `${selectedCli.label} · ${selectedCli.description}`
    : "本地 CLI 路线";
  const cloudDescription = title === "图片生成"
    ? "云端 Images API 路线"
    : "云端 Chat Completions 路线";

  const changeCli = (cliId) => {
    const defaults = {
      codex: channel === "image" ? "Codex CLI / imagegen skill" : "Codex CLI / gpt-5-codex",
      kimi: "",
      claude: "",
      custom: "",
    };
    onChange({
      ...value,
      cliId,
      cliCommand: value.cliCommand || "",
      modelName: defaults[cliId] ?? "",
    });
  };

  return (
    <article className="model-config-block">
      <header>
        <SoftIcon tone={tone}>{icon}</SoftIcon>
        <div>
          <h3>{title}</h3>
          <p>{value.provider === "local" ? localDescription : cloudDescription}</p>
        </div>
      </header>
      <ProviderSwitch value={value.provider} onChange={(provider) => update("provider", provider)} />
      {value.provider === "local" ? (
        <>
          <label className="mini-field">
            <span>本机 CLI</span>
            <select value={selectedCliId} onChange={(event) => changeCli(event.target.value)}>
              {availableClis.map((cli) => (
                <option key={cli.id} value={cli.id} disabled={cli.available === false}>
                  {cli.label}{cli.available === true ? " · 可用" : cli.available === false ? " · 不可用" : ""}
                </option>
              ))}
            </select>
          </label>
          {selectedCliId === "custom" ? (
            <label className="mini-field">
              <span>CLI 命令或绝对路径</span>
              <input
                value={value.cliCommand || ""}
                onChange={(event) => update("cliCommand", event.target.value)}
                placeholder="例如 my-agent-cli 或 /opt/bin/my-agent-cli"
              />
            </label>
          ) : null}
          <label className="mini-field">
            <span>模型别名（可留空使用 CLI 默认值）</span>
            <input
              value={value.modelName || ""}
              onChange={(event) => update("modelName", event.target.value)}
              placeholder={
                selectedCliId === "kimi"
                  ? "例如 kimi-code/k3"
                  : selectedCliId === "claude"
                    ? "例如 sonnet 或 opus"
                    : "留空使用 CLI 当前默认模型"
              }
            />
          </label>
          <div className="cli-detection-row">
            <button type="button" onClick={onDetect} disabled={detectionState === "running"}>
              {detectionState === "running" ? "检测中..." : "检测本机 CLI"}
            </button>
            <span className={selectedCli?.available === true ? "ready" : selectedCli?.available === false ? "missing" : ""}>
              {selectedCli?.available === true
                ? `${selectedCli.version || "已安装"}`
                : selectedCli?.available === false
                  ? "当前不可用"
                  : "点击检测安装状态"}
            </span>
          </div>
        </>
      ) : (
        <>
          <label className="mini-field">
            <span>模型名称</span>
            <input value={value.modelName} onChange={(event) => update("modelName", event.target.value)} />
          </label>
          <label className="mini-field">
            <span>API Key</span>
            <input
              value={value.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              placeholder="必填"
              type="password"
            />
          </label>
          <label className="mini-field">
            <span>API Base URL</span>
            <input
              value={value.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
        </>
      )}
    </article>
  );
}

export function App() {
  const personaRef = useRef(null);
  const keywordRef = useRef(null);
  const writingBriefRef = useRef(null);
  const [persona, setPersona] = useStoredState("persona", defaultPersona);
  const [keyword, setKeyword] = useStoredState("keyword", defaultKeyword);
  const [writingBrief, setWritingBrief] = useStoredState("writingBrief", defaultBrief);
  const [modelConfig, setModelConfig] = useStoredState("modelConfig", defaultModelConfig);
  const [localClis, setLocalClis] = useState(defaultLocalClis);
  const [cliDetectionState, setCliDetectionState] = useState("idle");
  const [activeStep, setActiveStep] = useState("input");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchIds, setSelectedSearchIds] = useState([]);
  const [ragItems, setRagItems] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [imageSet, setImageSet] = useState(null);
  const [innerCount, setInnerCount] = useStoredState("innerCount", 4);
  const [activeImageId, setActiveImageId] = useState(null);
  const [imageSetProgress, setImageSetProgress] = useState(null);
  const [previewImageId, setPreviewImageId] = useState(null);
  const [exportResult, setExportResult] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [storeState, setStoreState] = useState("loading");
  const [saveState, setSaveState] = useState("idle");
  const skipAutoSaveRef = useRef(true);
  const [generatingKind, setGeneratingKind] = useState("");
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationStage, setAutomationStage] = useState("");
  const [cliStatus, setCliStatus] = useState({
    state: "idle",
    label: "生成通道",
    text: "尚未调用生成服务。",
    commandPreview: "",
    durationMs: null,
    generatedAt: "",
    code: "",
  });
  const [notice, setNotice] = useState({
    type: "ready",
    text: "已加载新版阶段式工作台，支持手动逐步确认或一次点击自动化生成。",
  });

  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId),
    [selectedTopicId, topics],
  );
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId),
    [drafts, selectedDraftId],
  );
  const imageSetTotal = imageSet?.items?.length ?? 0;
  const imageSetDoneCount = (imageSet?.items ?? []).filter((item) => item.image).length;
  const previewItems = useMemo(() => (imageSet?.items ?? []).filter((item) => item.image), [imageSet]);
  const previewItem =
    previewItems.find((item) => item.id === previewImageId) ?? previewItems[0] ?? null;
  const previewIndex = previewItem ? previewItems.indexOf(previewItem) : -1;

  const progress = useMemo(() => {
    const checks = [
      persona.trim().length > 0,
      keyword.trim().length > 0,
      searchResults.length > 0,
      ragItems.length > 0,
      topics.length > 0 && selectedTopic,
      drafts.length > 0 && selectedDraft,
      imageSetTotal > 0,
      imageSetTotal > 0 && imageSetDoneCount === imageSetTotal,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [
    drafts.length,
    imageSetDoneCount,
    imageSetTotal,
    keyword,
    persona,
    ragItems.length,
    searchResults.length,
    selectedDraft,
    selectedTopic,
    topics.length,
  ]);

  const setError = (key) => {
    setNotice({ type: "error", text: errorMessages[key] });
  };

  const setSuccess = (text) => {
    setNotice({ type: "success", text });
  };

  const setCustomError = (text) => {
    setNotice({ type: "error", text });
  };

  const isBusy = Boolean(generatingKind) || automationRunning;

  const updateModelConfig = (channel, value) => {
    setModelConfig((current) => ({ ...current, [channel]: value }));
  };

  const channelConfig = (channel) => ({
    ...defaultModelConfig[channel],
    ...(modelConfig[channel] || {}),
    cliId: modelConfig[channel]?.cliId || "codex",
    cliCommand: modelConfig[channel]?.cliCommand || "",
  });

  const detectConfiguredClis = async () => {
    const textConfig = channelConfig("text");
    setCliDetectionState("running");
    setCliStatus({
      state: "running",
      label: "本机 CLI 检测",
      text: "正在检测 Codex、Kimi、Claude 与当前自定义规范 CLI...",
      commandPreview: "[cli] --version",
      durationMs: null,
      generatedAt: "",
      code: "",
    });
    try {
      const result = await requestLocalCliDetection({
        customCommand: textConfig.cliId === "custom" ? textConfig.cliCommand : "",
      });
      const nextClis = defaultLocalClis.map((fallback) => (
        result.clis.find((item) => item.id === fallback.id) || fallback
      ));
      setLocalClis(nextClis);
      setCliDetectionState("success");
      const availableLabels = nextClis
        .filter((item) => item.available)
        .map((item) => `${item.label}${item.version ? ` ${item.version}` : ""}`);
      const text = availableLabels.length
        ? `检测完成：${availableLabels.join("、")} 可用。`
        : "未检测到可用的本机生成 CLI。";
      setCliStatus({
        state: availableLabels.length ? "success" : "error",
        label: "本机 CLI 检测",
        text,
        commandPreview: "[cli] --version",
        durationMs: null,
        generatedAt: result.generatedAt,
        code: availableLabels.length ? "" : "LOCAL_CLI_UNAVAILABLE",
      });
      if (availableLabels.length) setSuccess(text);
      else setCustomError(text);
    } catch (error) {
      const message = error?.message || "本机 CLI 检测失败。";
      setCliDetectionState("error");
      setCliStatus({
        state: "error",
        label: "本机 CLI 检测",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "LOCAL_CLI_UNAVAILABLE",
      });
      setCustomError(message);
    }
  };

  const requireModelConfig = (channel) => {
    const config = channelConfig(channel);
    if (config.provider === "cloud") {
      if (!config.modelName.trim() || !config.apiKey.trim() || !config.baseUrl.trim() || isCloudPlaceholderModel(config.modelName)) {
        setError("config");
        return false;
      }
      try {
        const baseUrl = new URL(config.baseUrl.trim());
        if (!["http:", "https:"].includes(baseUrl.protocol)) {
          setCustomError("API Base URL 只支持 http 或 https。");
          return false;
        }
      } catch {
        setCustomError("API Base URL 不是合法 URL。");
        return false;
      }
    } else {
      if (config.cliId === "custom" && !config.cliCommand.trim()) {
        setCustomError("请填写自定义规范 CLI 的命令名或绝对路径。");
        return false;
      }
      const selectedCli = localClis.find((item) => item.id === config.cliId);
      if (selectedCli?.available === false) {
        setCustomError(`${selectedCli.label} 当前不可用，请重新检测或选择其他 CLI。`);
        return false;
      }
      if (selectedCli && !selectedCli.capabilities?.[channel]) {
        setCustomError(`${selectedCli.label} 不支持${channel === "image" ? "图片" : "文本"}生成。`);
        return false;
      }
    }
    return true;
  };

  const requireTextModel = () => requireModelConfig("text");

  const requireImageModel = () => requireModelConfig("image");

  const providerLabel = (channel) => {
    const config = channelConfig(channel);
    if (config.provider === "cloud") {
      return channel === "image" ? "云端图片 API" : "云端文本 API";
    }
    const cli = localClis.find((item) => item.id === config.cliId);
    return `本地 ${cli?.label || "CLI"}`;
  };

  const providerPreview = (channel) => {
    const config = channelConfig(channel);
    if (config.provider === "local") {
      const cli = localClis.find((item) => item.id === config.cliId);
      return cli?.commandPreview || "[cli] --prompt ...";
    }
    const endpoint = channel === "image" ? "/images/generations" : "/chat/completions";
    try {
      const url = new URL(config.baseUrl.trim());
      const currentPath = url.pathname.replace(/\/+$/, "");
      if (!currentPath.toLowerCase().endsWith(endpoint.toLowerCase())) {
        url.pathname = `${currentPath}/${endpoint.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
      }
      url.search = "";
      url.hash = "";
      return `POST ${url.toString()}`;
    } catch {
      return `POST ${endpoint}`;
    }
  };

  const requestPayloadConfig = (channel) => {
    const config = channelConfig(channel);
    if (config.provider !== "cloud") {
      return {
        cliId: config.cliId,
        cliCommand: config.cliCommand,
        modelName: config.modelName,
      };
    }

    return {
      modelName: config.modelName,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };
  };

  const workflowContext = (overrides = {}) => ({
    persona: overrides.persona ?? persona,
    keyword: overrides.keyword ?? keyword,
    ragItems: overrides.ragItems ?? ragItems,
    writingBrief: overrides.writingBrief ?? writingBrief,
  });

  const requestTextItems = async (kind, payload = {}, contextOverrides = {}) => {
    const requestGeneration =
      channelConfig("text").provider === "cloud" ? requestCloudGeneration : requestLocalCliGeneration;
    const context = workflowContext(contextOverrides);
    const result = await requestGeneration({
      kind,
      persona: context.persona,
      keyword: context.keyword,
      ragItems: context.ragItems,
      writingBrief: context.writingBrief,
      ...requestPayloadConfig("text"),
      ...payload,
    });

    return {
      items: result.items,
      styleGuide: result.styleGuide ?? "",
      routeLabel: providerLabel("text"),
      commandPreview: result.commandPreview,
      durationMs: result.durationMs,
      generatedAt: result.generatedAt,
    };
  };

  const requestDecision = async (decisionKind, options, contextOverrides = {}, payload = {}) => {
    const routeLabel = providerLabel("text");
    const decisionLabel = decisionLabels[decisionKind] ?? "候选项";
    const requestModelDecision =
      channelConfig("text").provider === "cloud" ? requestCloudDecision : requestLocalCliDecision;
    const context = workflowContext(contextOverrides);

    setGeneratingKind(`decision-${decisionKind}`);
    setCliStatus({
      state: "running",
      label: routeLabel,
      text: `正在通过 ${routeLabel} 选择${decisionLabel}...`,
      commandPreview: providerPreview("text"),
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    const result = await requestModelDecision({
      decisionKind,
      persona: context.persona,
      keyword: context.keyword,
      ragItems: context.ragItems,
      writingBrief: context.writingBrief,
      options,
      ...requestPayloadConfig("text"),
      ...payload,
    });

    setCliStatus({
      state: "success",
      label: routeLabel,
      text: `${routeLabel} 已选择${decisionLabel}：${result.reason}`,
      commandPreview: result.commandPreview,
      durationMs: result.durationMs,
      generatedAt: result.generatedAt,
      code: "",
    });

    return { ...result, routeLabel };
  };

  const requestCoverImageResult = async (prompt, selectedDraftValue, contextOverrides = {}) => {
    const requestCoverImage =
      channelConfig("image").provider === "cloud" ? requestCloudCoverImage : requestLocalCliCoverImage;
    const context = workflowContext(contextOverrides);

    return requestCoverImage({
      persona: context.persona,
      keyword: context.keyword,
      selectedDraft: selectedDraftValue,
      selectedPrompt: prompt,
      prompt: prompt.prompt,
      ...requestPayloadConfig("image"),
    });
  };

  const runTextGeneration = async (kind, payload) => {
    const label = generationLabels[kind];
    const routeLabel = providerLabel("text");
    setGeneratingKind(kind);
    setCliStatus({
      state: "running",
      label: routeLabel,
      text: `正在通过 ${routeLabel} 生成${label}...`,
      commandPreview: providerPreview("text"),
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestTextItems(kind, payload);

      setCliStatus({
        state: "success",
        label: routeLabel,
        text:
          kind === "imageSetPlan"
            ? `${routeLabel} 已生成配图方案（1 张封面 + ${result.items.length - 1} 张内页），可在下方调整后出图。`
            : `${routeLabel} 已生成 ${result.items.length} 条${label}。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
      return { items: result.items, styleGuide: result.styleGuide ?? "", routeLabel };
    } catch (error) {
      const message = error?.message || `${routeLabel}生成失败。`;
      setCliStatus({
        state: "error",
        label: routeLabel,
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "GENERATION_FAILED",
      });
      setCustomError(message);
      return false;
    } finally {
      setGeneratingKind("");
    }
  };

  const runSearch = async () => {
    if (!keyword.trim()) {
      setError("search");
      return;
    }

    const trimmedKeyword = keyword.trim();
    setGeneratingKind("search");
    setCliStatus({
      state: "running",
      label: "小红书 CLI 搜索",
      text: `正在通过本机 xhs 搜索「${trimmedKeyword}」...`,
      commandPreview: `xhs --cookie-source none search "${trimmedKeyword}" --sort popular --type all --page 1 --json`,
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestXhsSearch({
        keyword: trimmedKeyword,
        sort: "popular",
        type: "all",
        page: 1,
      });

      setSearchResults(result.items);
      setSelectedSearchIds([]);
      setActiveStep("research");
      setCliStatus({
        state: "success",
        label: "小红书 CLI 搜索",
        text: `xhs 已返回 ${result.items.length} 条热门内容，结果尚未自动入库。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
      setSuccess(`已通过本机 xhs 搜索「${trimmedKeyword}」，结果尚未自动入库。`);
    } catch (error) {
      const message = error?.message || "小红书热门内容搜索失败。";
      setSearchResults([]);
      setSelectedSearchIds([]);
      setActiveStep("research");
      setCliStatus({
        state: "error",
        label: "小红书 CLI 搜索",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "XHS_FAILED",
      });
      setCustomError(message);
    } finally {
      setGeneratingKind("");
    }
  };

  const resetGeneratedState = () => {
    setSearchResults([]);
    setSelectedSearchIds([]);
    setRagItems([]);
    setTopics([]);
    setSelectedTopicId(null);
    setDrafts([]);
    setSelectedDraftId(null);
    setImageSet(null);
    setActiveImageId(null);
    setImageSetProgress(null);
    setPreviewImageId(null);
    setExportResult(null);
  };

  const toggleSearchResult = (id) => {
    setSelectedSearchIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const addToRag = () => {
    if (selectedSearchIds.length === 0) {
      setError("rag");
      return;
    }

    const selectedItems = searchResults.filter((result) => selectedSearchIds.includes(result.id));
    setRagItems((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      return [...current, ...selectedItems.filter((item) => !existingIds.has(item.id))];
    });
    setActiveStep("rag");
    setSuccess(`已加入 ${selectedItems.length} 条参考内容到本地 RAG。`);
  };

  const generateTopics = async () => {
    if (!persona.trim() || !keyword.trim() || ragItems.length === 0) {
      setError("topics");
      return;
    }
    if (!requireTextModel()) return;

    const result = await runTextGeneration("topics", {});
    if (!result) return;
    const nextTopics = result.items;

    setTopics(nextTopics);
    setSelectedTopicId(nextTopics[0].id);
    setDrafts([]);
    setSelectedDraftId(null);
    setImageSet(null);
    setActiveStep("topics");
    setSuccess(`已通过 ${result.routeLabel} 生成 10 个选题。`);
  };

  const generateDrafts = async () => {
    if (!selectedTopic) {
      setError("drafts");
      return;
    }
    if (!requireTextModel()) return;

    const result = await runTextGeneration("drafts", { selectedTopic });
    if (!result) return;
    const nextDrafts = result.items;

    setDrafts(nextDrafts);
    setSelectedDraftId(nextDrafts[0].id);
    setImageSet(null);
    setActiveStep("drafts");
    setSuccess(`已通过 ${result.routeLabel} 生成 5 篇文案，可选择一篇继续生成配图方案。`);
  };

  const composeImagePrompt = (styleGuideValue, item) => {
    const guide = String(styleGuideValue ?? "").trim();
    const prompt = String(item.prompt ?? "").trim();
    return guide ? `${guide}\n\n${prompt}` : prompt;
  };

  const generateImageSetPlan = async () => {
    if (!selectedDraft) {
      setError("prompts");
      return;
    }
    if (!requireTextModel()) return;

    const result = await runTextGeneration("imageSetPlan", {
      selectedTopic,
      selectedDraft,
      innerCount,
    });
    if (!result) return;

    setImageSet({
      styleGuide: result.styleGuide,
      items: result.items.map((item) => ({ ...item, image: null })),
    });
    setActiveImageId(null);
    setImageSetProgress(null);
    setPreviewImageId(null);
    setExportResult(null);
    setActiveStep("cover");
    setSuccess(`已通过 ${result.routeLabel} 生成配图方案（含统一风格规范），可编辑后逐张生成整套配图。`);
  };

  const updateStyleGuide = (value) => {
    setImageSet((current) => (current ? { ...current, styleGuide: value } : current));
  };

  const updateImageSetItem = (itemId, field, value) => {
    setImageSet((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId ? { ...item, [field]: value } : item,
            ),
          }
        : current,
    );
  };

  const requestImageForItem = async (item, styleGuideValue, selectedDraftValue, contextOverrides = {}) =>
    requestCoverImageResult(
      { title: item.title, prompt: composeImagePrompt(styleGuideValue, item) },
      selectedDraftValue,
      contextOverrides,
    );

  const applyItemResult = (itemId, result) => {
    setImageSet((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    image: {
                      ...result.image,
                      src: resolveAssetUrl(result.image.src),
                      createdAt: nowText(),
                      generatedAt: result.generatedAt,
                    },
                  }
                : item,
            ),
          }
        : current,
    );
  };

  const generateImageSetSerial = async (pendingItems, styleGuideValue, selectedDraftValue, contextOverrides = {}) => {
    const routeLabel = providerLabel("image");
    const total = pendingItems.length;

    for (let index = 0; index < total; index += 1) {
      const item = pendingItems[index];
      setActiveImageId(item.id);
      setImageSetProgress({ index: index + 1, total });
      setCliStatus({
        state: "running",
        label: routeLabel,
        text: `正在通过 ${routeLabel} 生成第 ${index + 1}/${total} 张：${item.title}...`,
        commandPreview: providerPreview("image"),
        durationMs: null,
        generatedAt: "",
        code: "",
      });

      const result = await requestImageForItem(item, styleGuideValue, selectedDraftValue, contextOverrides);
      applyItemResult(item.id, result);

      setCliStatus({
        state: "success",
        label: routeLabel,
        text: `${routeLabel} 已完成第 ${index + 1}/${total} 张：${item.title}。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
    }
  };

  const generateImageSetItem = async (itemId) => {
    const item = (imageSet?.items ?? []).find((candidate) => candidate.id === itemId);
    if (!item || !selectedDraft) {
      setError("image");
      return;
    }
    if (!requireImageModel()) return;

    const routeLabel = providerLabel("image");
    setActiveImageId(itemId);
    setGeneratingKind("imageSetItem");
    setCliStatus({
      state: "running",
      label: routeLabel,
      text: `正在通过 ${routeLabel} 生成「${item.title}」...`,
      commandPreview: providerPreview("image"),
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestImageForItem(item, imageSet.styleGuide, selectedDraft);
      applyItemResult(itemId, result);
      setCliStatus({
        state: "success",
        label: routeLabel,
        text: `${routeLabel} 已生成「${item.title}」的配图。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
      setActiveStep("cover");
      setSuccess(`已通过 ${routeLabel} 生成「${item.title}」的配图。`);
    } catch (error) {
      const message = error?.message || `${routeLabel}配图生成失败。`;
      setCliStatus({
        state: "error",
        label: routeLabel,
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "CODEX_FAILED",
      });
      setCustomError(message);
    } finally {
      setGeneratingKind("");
      setActiveImageId(null);
    }
  };

  const generateAllImages = async () => {
    if (!imageSet || imageSet.items.length === 0 || !selectedDraft) {
      setError("image");
      return;
    }
    if (!requireImageModel()) return;

    const pendingItems = imageSet.items.filter((item) => !item.image);
    if (pendingItems.length === 0) {
      setSuccess("整套配图已全部生成，可对单张使用「重新生成」。");
      return;
    }

    setGeneratingKind("imageSet");
    setNotice({
      type: "success",
      text: `已开始串行生成 ${pendingItems.length} 张配图：本次点击授权逐张调用图片模型。`,
    });

    try {
      await generateImageSetSerial(pendingItems, imageSet.styleGuide, selectedDraft);
      setActiveStep("cover");
      setSuccess(`整套配图已完成：${imageSetDoneCount + pendingItems.length}/${imageSetTotal} 张已生成。`);
    } catch (error) {
      const message = error?.message || "整套配图生成中断。";
      setCliStatus({
        state: "error",
        label: "整套配图",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "CODEX_FAILED",
      });
      setCustomError(`整套配图生成中断：${message}`);
    } finally {
      setGeneratingKind("");
      setActiveImageId(null);
      setImageSetProgress(null);
    }
  };

  const runAutomation = async () => {
    let currentAutomationStage = "";
    const moveAutomationStage = (stage) => {
      currentAutomationStage = stage;
      setAutomationStage(stage);
    };
    const context = {
      persona: (personaRef.current?.value ?? persona).trim(),
      keyword: (keywordRef.current?.value ?? keyword).trim(),
      writingBrief: (writingBriefRef.current?.value ?? writingBrief).trim(),
      ragItems: [],
    };

    if (!context.persona || !context.keyword || !context.writingBrief) {
      setCustomError("自动化生成需要先填写账号人设、创作关键词和补充撰写思路。");
      return;
    }
    if (!requireTextModel() || !requireImageModel()) return;

    setAutomationRunning(true);
    resetGeneratedState();
    setNotice({ type: "success", text: "自动化生成已开始：本次点击授权搜索、模型决策入库、生成和整套配图。" });

    try {
      moveAutomationStage("搜索热门内容");
      setGeneratingKind("search");
      setActiveStep("research");
      setCliStatus({
        state: "running",
        label: "小红书 CLI 搜索",
        text: `自动化正在通过本机 xhs 搜索「${context.keyword}」...`,
        commandPreview: `xhs --cookie-source none search "${context.keyword}" --sort popular --type all --page 1 --json`,
        durationMs: null,
        generatedAt: "",
        code: "",
      });
      const searchResult = await requestXhsSearch({
        keyword: context.keyword,
        sort: "popular",
        type: "all",
        page: 1,
      });
      const nextSearchResults = searchResult.items;
      if (nextSearchResults.length === 0) {
        throw Object.assign(new Error("xhs 没有返回可用于自动化生成的热门内容。"), {
          code: "XHS_EMPTY",
        });
      }
      setSearchResults(nextSearchResults);
      setCliStatus({
        state: "success",
        label: "小红书 CLI 搜索",
        text: `xhs 已返回 ${nextSearchResults.length} 条热门内容，自动化将交给文案模型筛选参考。`,
        commandPreview: searchResult.commandPreview,
        durationMs: searchResult.durationMs,
        generatedAt: searchResult.generatedAt,
        code: "",
      });

      moveAutomationStage("选择并加入 RAG");
      const ragDecision = await requestDecision("rag", nextSearchResults, context);
      const nextSelectedSearchIds = ragDecision.selectedIds;
      const nextRagItems = nextSearchResults.filter((item) => nextSelectedSearchIds.includes(item.id));
      setSelectedSearchIds(nextSelectedSearchIds);
      setRagItems(nextRagItems);
      setActiveStep("rag");
      context.ragItems = nextRagItems;

      moveAutomationStage("生成 10 个选题");
      setGeneratingKind("topics");
      setCliStatus({
        state: "running",
        label: providerLabel("text"),
        text: `自动化正在通过 ${providerLabel("text")} 生成选题...`,
        commandPreview: providerPreview("text"),
        durationMs: null,
        generatedAt: "",
        code: "",
      });
      const topicResult = await requestTextItems("topics", {}, context);
      const nextTopics = topicResult.items;
      setTopics(nextTopics);
      setActiveStep("topics");
      setCliStatus({
        state: "success",
        label: topicResult.routeLabel,
        text: `${topicResult.routeLabel} 已生成 ${nextTopics.length} 条选题，自动化将选择 1 条继续。`,
        commandPreview: topicResult.commandPreview,
        durationMs: topicResult.durationMs,
        generatedAt: topicResult.generatedAt,
        code: "",
      });

      moveAutomationStage("选择选题");
      const topicDecision = await requestDecision("topic", nextTopics, context);
      const nextSelectedTopic = nextTopics.find((topic) => topic.id === topicDecision.selectedIds[0]);
      setSelectedTopicId(nextSelectedTopic.id);

      moveAutomationStage("生成 5 篇文案");
      setGeneratingKind("drafts");
      setCliStatus({
        state: "running",
        label: providerLabel("text"),
        text: `自动化正在通过 ${providerLabel("text")} 生成文案...`,
        commandPreview: providerPreview("text"),
        durationMs: null,
        generatedAt: "",
        code: "",
      });
      const draftResult = await requestTextItems("drafts", { selectedTopic: nextSelectedTopic }, context);
      const nextDrafts = draftResult.items;
      setDrafts(nextDrafts);
      setActiveStep("drafts");
      setCliStatus({
        state: "success",
        label: draftResult.routeLabel,
        text: `${draftResult.routeLabel} 已生成 ${nextDrafts.length} 篇文案，自动化将选择 1 篇继续。`,
        commandPreview: draftResult.commandPreview,
        durationMs: draftResult.durationMs,
        generatedAt: draftResult.generatedAt,
        code: "",
      });

      moveAutomationStage("选择文案");
      const draftDecision = await requestDecision("draft", nextDrafts, context, {
        selectedTopic: nextSelectedTopic,
      });
      const nextSelectedDraft = nextDrafts.find((draft) => draft.id === draftDecision.selectedIds[0]);
      setSelectedDraftId(nextSelectedDraft.id);

      moveAutomationStage("生成配图方案");
      setGeneratingKind("imageSetPlan");
      setCliStatus({
        state: "running",
        label: providerLabel("text"),
        text: `自动化正在通过 ${providerLabel("text")} 生成配图方案...`,
        commandPreview: providerPreview("text"),
        durationMs: null,
        generatedAt: "",
        code: "",
      });
      const planResult = await requestTextItems(
        "imageSetPlan",
        { selectedTopic: nextSelectedTopic, selectedDraft: nextSelectedDraft, innerCount },
        context,
      );
      const nextImageSet = {
        styleGuide: planResult.styleGuide ?? "",
        items: planResult.items.map((item) => ({ ...item, image: null })),
      };
      setImageSet(nextImageSet);
      setActiveStep("cover");
      setCliStatus({
        state: "success",
        label: planResult.routeLabel,
        text: `${planResult.routeLabel} 已生成配图方案（${nextImageSet.items.length} 张），自动化将逐张生成整套配图。`,
        commandPreview: planResult.commandPreview,
        durationMs: planResult.durationMs,
        generatedAt: planResult.generatedAt,
        code: "",
      });

      moveAutomationStage("生成整套配图");
      setGeneratingKind("imageSet");
      await generateImageSetSerial(nextImageSet.items, nextImageSet.styleGuide, nextSelectedDraft, context);

      setSuccess("自动化生成已完成：热门参考、RAG、选题、文案、配图方案和整套配图均已生成。");
    } catch (error) {
      const message = error?.message || "自动化生成失败。";
      setCliStatus({
        state: "error",
        label: currentAutomationStage ? `自动化：${currentAutomationStage}` : "自动化生成",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "AUTOMATION_FAILED",
      });
      setCustomError(`自动化生成中断：${message}`);
    } finally {
      setAutomationRunning(false);
      setAutomationStage("");
      setGeneratingKind("");
      setActiveImageId(null);
      setImageSetProgress(null);
    }
  };

  const extractTags = (body) => {
    const matches = String(body ?? "").matchAll(/#([^#[\]]+)\[话题\]#/g);
    return [...new Set([...matches].map((match) => match[1].trim()).filter(Boolean))];
  };

  const exportNote = async () => {
    if (!selectedDraft) {
      setError("drafts");
      return;
    }
    if (!activeProjectId) {
      setCustomError("导出前请先保存项目（点左侧「保存」或「新建」）。");
      return;
    }

    setGeneratingKind("export");
    setCliStatus({
      state: "running",
      label: "笔记导出",
      text: "正在导出 note.md 与整套配图...",
      commandPreview: "POST /api/export",
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestExport({
        projectId: activeProjectId,
        title: selectedDraft.title,
        body: selectedDraft.body,
        tags: extractTags(selectedDraft.body),
        imageSet: imageSet
          ? { styleGuide: imageSet.styleGuide, items: imageSet.items }
          : undefined,
      });

      setExportResult(result);
      setCliStatus({
        state: "success",
        label: "笔记导出",
        text: `已导出到 ${result.exportDir}（${result.files?.length ?? 0} 个文件）。`,
        commandPreview: "POST /api/export",
        durationMs: result.durationMs ?? null,
        generatedAt: result.generatedAt ?? "",
        code: "",
      });
      setSuccess(`笔记已导出到 ${result.exportDir}。`);
    } catch (error) {
      const message = error?.message || "笔记导出失败。";
      setCliStatus({
        state: "error",
        label: "笔记导出",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "EXPORT_FAILED",
      });
      setCustomError(`笔记导出失败：${message}`);
    } finally {
      setGeneratingKind("");
    }
  };

  const makeProjectId = () => `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const applyWorkspace = (workspace) => {
    const nextProjects = Array.isArray(workspace?.projects) ? workspace.projects : [];
    setProjects(nextProjects);
    // 后端在空工作区返回 ""（而非 null），统一归一化，避免空串被当成有效项目 id。
    setActiveProjectId(workspace?.activeProjectId || null);
    return nextProjects;
  };

  const applyProject = (project) => {
    if (!project) return;
    skipAutoSaveRef.current = true;
    setPersona(project.persona ?? "");
    setKeyword(project.keyword ?? "");
    setWritingBrief(project.writingBrief ?? "");
    setSearchResults(Array.isArray(project.searchResults) ? project.searchResults : []);
    setSelectedSearchIds([]);
    setRagItems(Array.isArray(project.ragItems) ? project.ragItems : []);
    setTopics(Array.isArray(project.topics) ? project.topics : []);
    setSelectedTopicId(project.selectedTopicId ?? null);
    setDrafts(Array.isArray(project.drafts) ? project.drafts : []);
    setSelectedDraftId(project.selectedDraftId ?? null);
    setImageSet(project.imageSet ?? null);
    setActiveImageId(null);
    setImageSetProgress(null);
    setActiveStep(
      project.imageSet
        ? "cover"
        : (project.drafts ?? []).length
          ? "drafts"
          : (project.topics ?? []).length
            ? "topics"
            : (project.ragItems ?? []).length
              ? "rag"
              : (project.searchResults ?? []).length
                ? "research"
                : "input",
    );
  };

  const projectPayload = (overrides = {}) => {
    const id = overrides.id ?? (activeProjectId || makeProjectId());
    const existing = projects.find((project) => project.id === id);
    const titleBase = (keywordRef.current?.value ?? keyword).trim() || "未命名";
    return {
      id,
      title: existing?.title ?? `${titleBase} @ ${nowText()}`,
      persona,
      keyword,
      writingBrief,
      searchResults,
      ragItems,
      topics,
      selectedTopicId,
      drafts,
      selectedDraftId,
      imageSet,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  };

  const saveActiveProject = async (overrides = {}) => {
    if (storeState === "error") {
      setCustomError("工作区存储不可用，无法保存项目。请确认后端已启动。");
      return false;
    }
    const project = projectPayload(overrides);
    setSaveState("saving");
    try {
      const result = await requestStoreSave({ action: "saveProject", project });
      applyWorkspace(result.workspace);
      setActiveProjectId(project.id);
      setLastSavedAt(nowText());
      setSaveState("saved");
      return true;
    } catch (error) {
      const message = error?.message || "项目保存失败。";
      setSaveState("error");
      setCustomError(`项目保存失败：${message}`);
      return false;
    }
  };

  const createNewProject = async () => {
    if (storeState === "error") {
      setCustomError("工作区存储不可用，无法新建项目。请确认后端已启动。");
      return;
    }
    const id = makeProjectId();
    const titleBase = (keywordRef.current?.value ?? keyword).trim() || "未命名";
    const timestamp = new Date().toISOString();
    const project = {
      id,
      title: `${titleBase} @ ${nowText()}`,
      persona,
      keyword,
      writingBrief,
      searchResults: [],
      ragItems: [],
      topics: [],
      selectedTopicId: null,
      drafts: [],
      selectedDraftId: null,
      imageSet: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    skipAutoSaveRef.current = true;
    resetGeneratedState();
    setActiveStep("input");
    setSaveState("saving");
    try {
      const result = await requestStoreSave({ action: "saveProject", project });
      applyWorkspace(result.workspace);
      setActiveProjectId(id);
      setLastSavedAt(nowText());
      setSaveState("saved");
      setSuccess(`已新建项目「${project.title}」。`);
    } catch (error) {
      const message = error?.message || "项目新建失败。";
      setSaveState("error");
      setCustomError(`项目新建失败：${message}`);
    }
  };

  const loadProject = async (project) => {
    applyProject(project);
    setActiveProjectId(project.id);
    setSuccess(`已加载项目「${project.title}」。`);
    if (storeState === "error") return;
    try {
      const result = await requestStoreSave({ action: "setActive", projectId: project.id });
      applyWorkspace(result.workspace);
      setActiveProjectId(project.id);
    } catch (error) {
      setCustomError(`切换项目失败：${error?.message || "未知错误"}`);
    }
  };

  const deleteProject = async (project) => {
    if (storeState === "error") {
      setCustomError("工作区存储不可用，无法删除项目。请确认后端已启动。");
      return;
    }
    if (!window.confirm(`删除项目「${project.title}」？此操作不可撤销。`)) return;
    try {
      const result = await requestStoreSave({ action: "deleteProject", projectId: project.id });
      const nextProjects = applyWorkspace(result.workspace);
      if (project.id === activeProjectId) {
        const nextActive = nextProjects.find((item) => item.id === result.workspace?.activeProjectId);
        if (nextActive) applyProject(nextActive);
        else {
          skipAutoSaveRef.current = true;
          resetGeneratedState();
          setActiveStep("input");
        }
      }
      setSuccess(`已删除项目「${project.title}」。`);
    } catch (error) {
      setCustomError(`项目删除失败：${error?.message || "未知错误"}`);
    }
  };

  const projectMeta = (project) => {
    const total = project.imageSet?.items?.length ?? 0;
    const done = (project.imageSet?.items ?? []).filter((item) => item.image).length;
    const bits = [`参考 ${project.ragItems?.length ?? 0}`];
    if (total > 0) bits.push(`配图 ${done}/${total}`);
    if (project.updatedAt) {
      bits.push(
        `更新 ${new Date(project.updatedAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
    }
    return bits.join(" · ");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await requestStoreLoad();
        if (cancelled) return;
        const nextProjects = applyWorkspace(result.workspace ?? { projects: [] });
        const active = nextProjects.find((project) => project.id === result.workspace?.activeProjectId);
        if (active) applyProject(active);
        setStoreState("ready");
        if (nextProjects.length > 0) {
          setSuccess(`已恢复 ${nextProjects.length} 个草稿项目${active ? `，当前项目「${active.title}」` : ""}。`);
        }
      } catch (error) {
        if (cancelled) return;
        setStoreState("error");
        setCustomError(`工作区读取失败：${error?.message || "未知错误"}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅在应用启动时恢复一次工作区。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      saveActiveProject();
    }, 800);
    return () => clearTimeout(timer);
    // 阶段结果变化后防抖自动保存当前项目。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, keyword, writingBrief, searchResults, ragItems, topics, selectedTopicId, drafts, selectedDraftId, imageSet]);

  const saveDraft = () => {
    saveActiveProject();
  };

  return (
    <main className="app-shell" aria-label="青柠工作台小红书 AI 助理">
      <aside className="sidebar clay-panel">
        <div className="brand">
          <img className="brand-mark" src="/assets/lime-desk-mark.svg" alt="" />
          <div>
            <h1>青柠工作台</h1>
            <p>Lime Desk</p>
          </div>
        </div>

        <section className="profile-card">
          <img src="/assets/lime-desk-mark.svg" alt="青柠小怪头像" />
          <div>
            <h2>青柠小怪</h2>
            <span>内容创作助理</span>
            <p><i /> 本地草稿</p>
          </div>
        </section>

        <section className="flow-nav" aria-label="创作流程">
          <header>
            <h3>创作流程</h3>
            <strong>{progress}%</strong>
          </header>
          <div className="progress-track">
            <i style={{ "--progress": `${progress}%` }} />
          </div>
          {flowSteps.map((step, index) => (
            <button
              key={step.id}
              className={activeStep === step.id ? "active" : ""}
              onClick={() => setActiveStep(step.id)}
              type="button"
            >
              <SoftIcon tone={["pink", "yellow", "lime", "blue", "lavender", "rose"][index]}>
                {index + 1}
              </SoftIcon>
              <span>
                <strong>{step.label}</strong>
                <small>{step.meta}</small>
              </span>
            </button>
          ))}
        </section>

        <section className="project-list">
          <header>
            <h3>草稿项目</h3>
            <div className="project-actions">
              <button type="button" onClick={createNewProject} disabled={storeState === "loading"}>
                新建
              </button>
              <button type="button" onClick={saveDraft} disabled={storeState === "loading" || saveState === "saving"}>
                {saveState === "saving" ? "保存中..." : "保存"}
              </button>
            </div>
          </header>
          {storeState === "loading" ? (
            <div className="empty-state compact">
              <SoftIcon tone="pink">…</SoftIcon>
              <p>正在读取工作区...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state compact">
              <SoftIcon tone="pink">空</SoftIcon>
              <p>{storeState === "error" ? "工作区不可用，启动后端后即可保存项目。" : "还没有草稿项目，点「新建」开始。"}</p>
            </div>
          ) : (
            projects.map((project) => (
              <div key={project.id} className={project.id === activeProjectId ? "project-row active" : "project-row"}>
                <button className="project" type="button" onClick={() => loadProject(project)}>
                  <SoftIcon tone={project.id === activeProjectId ? "lime" : "pink"}>稿</SoftIcon>
                  <span>
                    <strong>{project.title}</strong>
                    <small>{projectMeta(project)}</small>
                  </span>
                </button>
                <button
                  className="project-delete"
                  type="button"
                  title="删除项目"
                  onClick={() => deleteProject(project)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </section>

        <button className="settings-button" type="button" onClick={() => setActiveStep("cover")}>
          <SoftIcon tone="lavender">收</SoftIcon>
          <span>
            {saveState === "error"
              ? "保存失败：请检查后端"
              : saveState === "saving"
                ? "正在保存..."
                : lastSavedAt
                  ? `已保存 ${lastSavedAt}`
                  : "保存与继续编辑"}
          </span>
        </button>
      </aside>

      <section className="workspace-shell column-bottom-fade" aria-label="阶段式创作工作台">
        <div className="workspace">
        <section className="overview clay-panel">
          <div className="overview-copy">
            <StageBadge tone="lime">新版流程</StageBadge>
            <h2>从关键词到可发布草稿</h2>
            <p>人设、热门参考、选题、文案、配图方案和整套配图支持手动逐步推进，也可以一次点击自动化生成。</p>
            <div className="metric-grid">
              <div className="metric">
                <span>搜索结果</span>
                <strong>{searchResults.length}</strong>
                <em>条</em>
              </div>
              <div className="metric">
                <span>RAG 参考</span>
                <strong>{ragItems.length}</strong>
                <em>条</em>
              </div>
              <div className="metric">
                <span>选题候选</span>
                <strong>{topics.length}</strong>
                <em>个</em>
              </div>
              <div className="metric">
                <span>文案草稿</span>
                <strong>{drafts.length}</strong>
                <em>篇</em>
              </div>
            </div>
          </div>
          <img className="hero-asset" src="/assets/notebook-pencil.png" alt="青柠笔记本和粉色铅笔" />
        </section>

        <section className="input-panel clay-panel lime-glow">
          <SectionHeader
            icon="入"
            tone="lime"
            title="账号人设与创作关键词"
            meta="人设最多 1000 字，关键词用于搜索和生成"
            action={
              <div className="section-actions">
                <button
                  className="soft-button automation-button"
                  disabled={isBusy}
                  type="button"
                  onClick={runAutomation}
                >
                  {automationRunning ? "自动化中..." : "自动化生成"}
                </button>
                <button
                  className="primary-button"
                  disabled={isBusy}
                  type="button"
                  onClick={runSearch}
                >
                  {generatingKind === "search" ? "搜索中..." : "搜索热门内容"}
                </button>
              </div>
            }
          />
          <div className="input-grid">
            <label className="field persona-field">
              <span>账号人设</span>
              <textarea
                ref={personaRef}
                maxLength={1000}
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
              />
              <small>{persona.length} / 1000</small>
            </label>
            <label className="field keyword-field">
              <span>创作关键词</span>
              <input ref={keywordRef} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
              <small>自动缓存</small>
            </label>
          </div>
        </section>

        <section className="stage-grid">
          <article className="stage-card clay-panel">
            <SectionHeader
              icon="搜"
              tone="yellow"
              title="热门内容搜索"
              meta="搜索只在点击后执行，结果不会自动入库"
              action={
                <button
                  className="soft-button yellow"
                  disabled={isBusy}
                  type="button"
                  onClick={runSearch}
                >
                  {generatingKind === "search" ? "搜索中..." : "重新搜索"}
                </button>
              }
            />
            <div className="result-list">
              {searchResults.length === 0 ? (
                <div className="empty-state">
                  <SoftIcon tone="yellow">待</SoftIcon>
                  <p>输入关键词后点击搜索，热门内容会显示在这里。</p>
                </div>
              ) : (
                searchResults.map((result) => (
                  <label
                    key={result.id}
                    className={selectedSearchIds.includes(result.id) ? "search-result selected" : "search-result"}
                  >
                    <input
                      checked={selectedSearchIds.includes(result.id)}
                      onChange={() => toggleSearchResult(result.id)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{result.title}</strong>
                      <p>{result.excerpt}</p>
                      <em>{result.metrics}</em>
                      <small>{result.source} | {result.keyword} | {result.lookupTime}</small>
                      <b>
                        {result.tags.map((tag) => (
                          <i key={tag}>#{tag}</i>
                        ))}
                      </b>
                    </span>
                  </label>
                ))
              )}
            </div>
          </article>

          <article className="stage-card clay-panel">
            <SectionHeader
              icon="库"
              tone="lime"
              title="本地 RAG 知识库"
              meta="只保存用户勾选并确认的参考内容"
              action={<button className="soft-button lime" disabled={isBusy} type="button" onClick={addToRag}>加入 RAG</button>}
            />
            <div className="rag-stack">
              {ragItems.length === 0 ? (
                <div className="empty-state">
                  <SoftIcon tone="lime">选</SoftIcon>
                  <p>勾选搜索结果后，点击加入本地 RAG。</p>
                </div>
              ) : (
                ragItems.map((item) => (
                  <article key={item.id} className="rag-item">
                    <strong>{item.title}</strong>
                    <p>{item.excerpt}</p>
                    <small>{item.tags.join(" / ")}</small>
                  </article>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="stage-card clay-panel wide-card">
          <SectionHeader
            icon="题"
            tone="blue"
            title="生成 10 个选题"
            meta="参考人设、关键词与本地 RAG"
            action={
              <button
                className="primary-button"
                disabled={isBusy}
                type="button"
                onClick={generateTopics}
              >
                {generatingKind === "topics" ? "生成中..." : "生成选题"}
              </button>
            }
          />
          <div className="topic-grid">
            {topics.length === 0 ? (
              <div className="empty-state inline">
                <SoftIcon tone="blue">10</SoftIcon>
                <p>完成搜索和 RAG 入库后，生成选题会出现在这里。</p>
              </div>
            ) : (
              topics.map((topic, index) => (
                <button
                  key={topic.id}
                  className={selectedTopicId === topic.id ? "topic-card selected" : "topic-card"}
                  onClick={() => setSelectedTopicId(topic.id)}
                  type="button"
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{topic.title}</strong>
                  <p>{topic.angle}</p>
                  <small>{topic.audience}</small>
                  <em>{topic.hook}</em>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="copy-grid">
          <article className="stage-card clay-panel">
            <SectionHeader
              icon="写"
              tone="lavender"
              title="撰写思路与 5 篇文案"
              meta={selectedTopic ? selectedTopic.title : "先选择一个选题"}
              action={
                <button
                  className="primary-button"
                  disabled={isBusy}
                  type="button"
                  onClick={generateDrafts}
                >
                  {generatingKind === "drafts" ? "生成中..." : "生成文案"}
                </button>
              }
            />
            <label className="field brief-field">
              <span>补充撰写思路</span>
              <textarea
                ref={writingBriefRef}
                value={writingBrief}
                onChange={(event) => setWritingBrief(event.target.value)}
              />
            </label>
            <div className="draft-list">
              {drafts.length === 0 ? (
                <div className="empty-state">
                  <SoftIcon tone="lavender">5</SoftIcon>
                  <p>选题确认后生成 5 篇文案。</p>
                </div>
              ) : (
                drafts.map((draft, index) => (
                  <button
                    key={draft.id}
                    className={selectedDraftId === draft.id ? "draft-card selected" : "draft-card"}
                    onClick={() => setSelectedDraftId(draft.id)}
                    type="button"
                  >
                    <span>文案 {index + 1}</span>
                    <strong>{draft.title}</strong>
                    <p>{draft.body}</p>
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="preview clay-panel">
            <SectionHeader
              icon="预"
              tone="pink"
              title="小红书预览"
              meta={
                previewItems.length > 1
                  ? `${previewItems.length} 张配图，可切换查看`
                  : "选择文案后实时查看草稿"
              }
            />
            <div className="post-card">
              <div className="post-author">
                <img src="/assets/lime-desk-mark.svg" alt="" />
                <strong>青柠小怪</strong>
                <button type="button">关注</button>
              </div>
              <div className="post-cover-wrap">
                <img
                  className="post-cover"
                  src={previewItem?.image?.src ?? "/assets/spring-outfit.png"}
                  alt={previewItem?.image?.alt ?? "夏日穿搭系列封面预览"}
                  onClick={
                    previewItem
                      ? () =>
                          setLightbox({
                            src: previewItem.image.src,
                            alt: previewItem.image.alt,
                            title: previewItem.title,
                          })
                      : undefined
                  }
                />
                <span className="cover-count">
                  {previewItem ? `${previewIndex + 1}/${previewItems.length}` : "预览"}
                </span>
              </div>
              {previewItems.length > 1 ? (
                <div className="post-thumbs" aria-label="配图切换">
                  {previewItems.map((item, index) => (
                    <button
                      key={item.id}
                      className={item.id === previewItem?.id ? "post-thumb active" : "post-thumb"}
                      type="button"
                      onClick={() => setPreviewImageId(item.id)}
                    >
                      <img src={item.image.src} alt={item.title} />
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <h3>{selectedDraft?.title ?? "选择一篇文案后，这里显示小红书标题"}</h3>
              <p>{selectedDraft?.body ?? "正文预览会保留话题标签格式，例如 #夏日通勤[话题]#。"}</p>
              <footer>
                <span><b className="post-icon like">心</b>1289</span>
                <span><b className="post-icon star">藏</b>965</span>
                <span><b className="post-icon chat">评</b>213</span>
              </footer>
            </div>
          </article>
        </section>

        <section className="cover-grid">
          <article className="stage-card clay-panel">
            <SectionHeader
              icon="图"
              tone="rose"
              title="配图方案与整套配图"
              meta="统一风格规范 + 逐张生成；Prompt 默认禁真人、脸、手和动物"
              action={
                <div className="section-actions">
                  <label className="inner-count-field">
                    <span>内页</span>
                    <select
                      value={innerCount}
                      disabled={isBusy}
                      onChange={(event) => setInnerCount(Number(event.target.value))}
                    >
                      {[3, 4, 5, 6].map((count) => (
                        <option key={count} value={count}>{count} 张</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary-button"
                    disabled={isBusy}
                    type="button"
                    onClick={generateImageSetPlan}
                  >
                    {generatingKind === "imageSetPlan" ? "生成中..." : "生成配图方案"}
                  </button>
                </div>
              }
            />

            {!imageSet ? (
              <div className="empty-state inline">
                <SoftIcon tone="rose">案</SoftIcon>
                <p>选择一篇文案后生成配图方案：1 张封面 + {innerCount} 张内页，风格统一、可编辑。</p>
              </div>
            ) : (
              <>
                <label className="field style-guide-field">
                  <span>统一风格规范（可编辑，出图时自动拼入每张 Prompt）</span>
                  <textarea
                    value={imageSet.styleGuide}
                    onChange={(event) => updateStyleGuide(event.target.value)}
                  />
                </label>
                <div className="image-item-list">
                  {imageSet.items.map((item) => (
                    <article
                      key={item.id}
                      className={activeImageId === item.id ? "image-item-card active" : "image-item-card"}
                    >
                      <header>
                        <StageBadge tone={item.role === "cover" ? "rose" : "blue"}>
                          {item.role === "cover" ? "封面" : "内页"}
                        </StageBadge>
                        <input
                          className="image-item-title"
                          value={item.title}
                          onChange={(event) => updateImageSetItem(item.id, "title", event.target.value)}
                        />
                        <button
                          className="soft-button lime"
                          disabled={isBusy}
                          type="button"
                          onClick={() => generateImageSetItem(item.id)}
                        >
                          {activeImageId === item.id ? "生成中..." : item.image ? "重新生成" : "生成"}
                        </button>
                      </header>
                      <textarea
                        className="image-item-prompt"
                        value={item.prompt}
                        onChange={(event) => updateImageSetItem(item.id, "prompt", event.target.value)}
                      />
                    </article>
                  ))}
                </div>
                <footer className="image-set-actions">
                  <button
                    className="primary-button"
                    disabled={isBusy}
                    type="button"
                    onClick={generateAllImages}
                  >
                    {generatingKind === "imageSet"
                      ? `生成中 ${imageSetProgress ? `${imageSetProgress.index}/${imageSetProgress.total}` : ""}...`
                      : `生成整套配图（${imageSetTotal - imageSetDoneCount} 张待生成）`}
                  </button>
                  <small>
                    已生成 {imageSetDoneCount}/{imageSetTotal} 张 · 串行逐张调用图片模型
                  </small>
                </footer>
              </>
            )}
          </article>

          <article className="cover-result clay-panel">
            <SectionHeader
              icon="成"
              tone="lime"
              title="成品画廊"
              meta={
                generatingKind === "imageSet" || generatingKind === "imageSetItem"
                  ? "正在生成配图..."
                  : imageSetTotal > 0
                    ? `已生成 ${imageSetDoneCount}/${imageSetTotal} 张 · 点击放大`
                    : "生成方案后逐张出图"
              }
              action={
                <button
                  className="soft-button lime"
                  disabled={isBusy || !selectedDraft}
                  type="button"
                  onClick={exportNote}
                >
                  {generatingKind === "export" ? "导出中..." : "导出笔记"}
                </button>
              }
            />
            <div className="gallery-grid">
              {imageSetTotal === 0 ? (
                <div className="empty-state">
                  <SoftIcon tone="lime">图</SoftIcon>
                  <p>整套配图会以 4:5 画廊展示在这里。</p>
                </div>
              ) : (
                imageSet.items.map((item) =>
                  item.image ? (
                    <button
                      key={item.id}
                      className={item.id === previewItem?.id ? "gallery-thumb current" : "gallery-thumb"}
                      type="button"
                      onClick={() => {
                        setPreviewImageId(item.id);
                        setLightbox({ src: item.image.src, alt: item.image.alt, title: item.title });
                      }}
                    >
                      <img src={item.image.src} alt={item.image.alt} />
                      <span>{item.title}</span>
                    </button>
                  ) : (
                    <div
                      key={item.id}
                      className={activeImageId === item.id ? "gallery-thumb pending active" : "gallery-thumb pending"}
                    >
                      <SoftIcon tone="lime">{activeImageId === item.id ? "…" : "待"}</SoftIcon>
                      <span>{item.title}</span>
                    </div>
                  ),
                )
              )}
            </div>
            {exportResult ? (
              <div className="export-result">
                <span>导出目录</span>
                <code>{exportResult.exportDir}</code>
                <small>
                  {exportResult.files?.length ?? 0} 个文件
                  {exportResult.skipped?.length ? ` · 跳过 ${exportResult.skipped.length} 个缺失文件` : ""}
                </small>
              </div>
            ) : null}
          </article>
        </section>
        </div>
      </section>

      <aside className="config-shell column-bottom-fade" aria-label="右侧配置栏">
        <div className="config-rail">
          <section className="model-card clay-panel">
            <h2>模型配置</h2>
            <p>文案生成与图片生成分开配置，字段会自动缓存。</p>
            <div className="model-route-list">
              <ModelConfig
                channel="text"
                title="文案生成"
                icon="文"
                tone="lime"
                value={channelConfig("text")}
                onChange={(value) => updateModelConfig("text", value)}
                localClis={localClis}
                detectionState={cliDetectionState}
                onDetect={detectConfiguredClis}
              />
              <ModelConfig
                channel="image"
                title="图片生成"
                icon="图"
                tone="pink"
                value={channelConfig("image")}
                onChange={(value) => updateModelConfig("image", value)}
                localClis={localClis}
                detectionState={cliDetectionState}
                onDetect={detectConfiguredClis}
              />
            </div>
          </section>

        <section className={`notice-card clay-panel ${notice.type}`}>
          <header>
            <h2>状态与错误提示</h2>
            <StageBadge tone={notice.type === "error" ? "rose" : "lime"}>
              {notice.type === "error" ? "需处理" : "正常"}
            </StageBadge>
          </header>
          <p>{notice.text}</p>
          <div className="manual-boundary">
            <span>搜索</span>
            <span>入库</span>
            <span>生成</span>
            <span>配图</span>
            <strong>{automationRunning ? `自动化：${automationStage}` : "手动逐步或自动化一次确认"}</strong>
          </div>
          <div className={`cli-status ${cliStatus.state}`}>
            <span>{cliStatus.label}</span>
            <p>{cliStatus.text}</p>
            {cliStatus.commandPreview ? <code>{cliStatus.commandPreview}</code> : null}
            {cliStatus.durationMs ? (
              <small>{Math.round(cliStatus.durationMs / 1000)}s · {new Date(cliStatus.generatedAt).toLocaleString("zh-CN")}</small>
            ) : null}
            {cliStatus.code ? <small>{cliStatus.code}</small> : null}
          </div>
        </section>

        <section className="error-lab clay-panel">
          <h2>错误覆盖</h2>
          <div>
            {Object.entries({
              search: "搜索失败",
              rag: "RAG 失败",
              topics: "选题失败",
              drafts: "文案失败",
              prompts: "方案失败",
              image: "配图失败",
              config: "配置缺失",
              key: "Key 无效",
              cli: "CLI 不可用",
              network: "网络失败",
            }).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setError(key)}>
                {label}
              </button>
            ))}
          </div>
        </section>
        </div>
      </aside>

      {lightbox ? (
        <div className="lightbox-overlay" role="presentation" onClick={() => setLightbox(null)}>
          <figure>
            <img src={lightbox.src} alt={lightbox.alt} />
            <figcaption>{lightbox.title} · 点击任意处关闭</figcaption>
          </figure>
        </div>
      ) : null}
    </main>
  );
}
