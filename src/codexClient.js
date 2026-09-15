import { API_BASE_STORAGE_KEY } from "./storageKeys.js";

const DEFAULT_API_BASE = "http://127.0.0.1:52881";

export function getApiBase() {
  try {
    const stored = window.localStorage.getItem(API_BASE_STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/+$/, "");
    }
  } catch {
    // localStorage 不可用（隐私模式等）时退回默认地址。
  }
  return DEFAULT_API_BASE;
}

export function resolveAssetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function backendDownError(apiBase, endpoint, method) {
  return Object.assign(
    new Error(`后端服务未启动或不可达（${apiBase}），请先启动后端进程再操作。`),
    {
      code: "NETWORK_BACKEND_DOWN",
      details: `${method} ${endpoint} 网络请求失败`,
    },
  );
}

async function performRequest(endpoint, method, payload, fallbackMessage, badJsonCode) {
  const apiBase = getApiBase();

  let response;
  try {
    response = await fetch(`${apiBase}${endpoint}`, {
      method,
      headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw backendDownError(apiBase, endpoint, method);
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw backendDownError(apiBase, endpoint, method);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Object.assign(new Error(fallbackMessage.nonJson), {
      code: badJsonCode,
      details: text.slice(0, 400),
    });
  }

  if (!response.ok || !data.ok) {
    throw Object.assign(new Error(data.error || fallbackMessage.failed), {
      code: data.code || badJsonCode,
      details: data.details,
    });
  }

  return data;
}

function requestJson(endpoint, payload, fallbackMessage, badJsonCode) {
  return performRequest(endpoint, "POST", payload, fallbackMessage, badJsonCode);
}

function requestJsonGet(endpoint, fallbackMessage, badJsonCode) {
  return performRequest(endpoint, "GET", undefined, fallbackMessage, badJsonCode);
}

export async function requestCodexGeneration(payload) {
  return requestJson(
    "/api/codex/generate",
    payload,
    {
      nonJson: "本地生成服务返回了非 JSON 内容。",
      failed: "Codex CLI 生成失败。",
    },
    "CODEX_BAD_JSON",
  );
}

export async function requestLocalCliDetection(payload = {}) {
  return requestJson(
    "/api/local-cli/detect",
    payload,
    {
      nonJson: "本地 CLI 检测服务返回了非 JSON 内容。",
      failed: "本地 CLI 检测失败。",
    },
    "LOCAL_CLI_BAD_JSON",
  );
}

export async function requestLocalCliGeneration(payload) {
  return requestJson(
    "/api/local-cli/generate",
    payload,
    {
      nonJson: "本地 CLI 生成服务返回了非 JSON 内容。",
      failed: "本地 CLI 生成失败。",
    },
    "LOCAL_CLI_BAD_JSON",
  );
}

export async function requestCloudGeneration(payload) {
  return requestJson(
    "/api/cloud/generate",
    payload,
    {
      nonJson: "云端文本 API 返回了非 JSON 内容。",
      failed: "云端文本 API 生成失败。",
    },
    "API_BAD_JSON",
  );
}

export async function requestCodexDecision(payload) {
  return requestJson(
    "/api/codex/decide",
    payload,
    {
      nonJson: "本地决策服务返回了非 JSON 内容。",
      failed: "Codex CLI 决策失败。",
    },
    "CODEX_BAD_JSON",
  );
}

export async function requestLocalCliDecision(payload) {
  return requestJson(
    "/api/local-cli/decide",
    payload,
    {
      nonJson: "本地 CLI 决策服务返回了非 JSON 内容。",
      failed: "本地 CLI 决策失败。",
    },
    "LOCAL_CLI_BAD_JSON",
  );
}

export async function requestCloudDecision(payload) {
  return requestJson(
    "/api/cloud/decide",
    payload,
    {
      nonJson: "云端文本 API 返回了非 JSON 内容。",
      failed: "云端文本 API 决策失败。",
    },
    "API_BAD_JSON",
  );
}

export async function requestCodexCoverImage(payload) {
  return requestJson(
    "/api/codex/cover-image",
    payload,
    {
      nonJson: "本地封面图服务返回了非 JSON 内容。",
      failed: "Codex CLI 封面图生成失败。",
    },
    "CODEX_BAD_JSON",
  );
}

export async function requestLocalCliCoverImage(payload) {
  return requestJson(
    "/api/local-cli/cover-image",
    payload,
    {
      nonJson: "本地 CLI 封面图服务返回了非 JSON 内容。",
      failed: "本地 CLI 封面图生成失败。",
    },
    "LOCAL_CLI_BAD_JSON",
  );
}

export async function requestCloudCoverImage(payload) {
  return requestJson(
    "/api/cloud/cover-image",
    payload,
    {
      nonJson: "云端图片 API 返回了非 JSON 内容。",
      failed: "云端图片 API 生成失败。",
    },
    "API_BAD_JSON",
  );
}

export async function requestXhsSearch(payload) {
  return requestJson(
    "/api/xhs/search",
    payload,
    {
      nonJson: "小红书搜索服务返回了非 JSON 内容。",
      failed: "小红书热门内容搜索失败。",
    },
    "XHS_BAD_JSON",
  );
}

export async function requestStoreLoad() {
  return requestJsonGet(
    "/api/store",
    {
      nonJson: "工作区存储服务返回了非 JSON 内容。",
      failed: "工作区读取失败。",
    },
    "STORE_BAD_JSON",
  );
}

export async function requestStoreSave(payload) {
  return requestJson(
    "/api/store",
    payload,
    {
      nonJson: "工作区存储服务返回了非 JSON 内容。",
      failed: "工作区保存失败。",
    },
    "STORE_BAD_JSON",
  );
}

export async function requestExport(payload) {
  return requestJson(
    "/api/export",
    payload,
    {
      nonJson: "导出服务返回了非 JSON 内容。",
      failed: "笔记导出失败。",
    },
    "EXPORT_BAD_JSON",
  );
}
