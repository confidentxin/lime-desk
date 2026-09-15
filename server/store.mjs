import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexApiError } from "./codex/validation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(repoRoot, "data");
const workspacePath = path.join(dataDir, "workspace.json");
const WORKSPACE_VERSION = 1;
const PROJECT_ID_PATTERN = /^proj-[A-Za-z0-9-]{1,64}$/;

const PROJECT_STRING_FIELDS = [
  "persona",
  "keyword",
  "writingBrief",
  "selectedTopicId",
  "selectedDraftId",
];

const PROJECT_ARRAY_FIELDS = [
  "ragItems",
  "searchResults",
  "topics",
  "drafts",
  "images",
];

function assertObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source, fieldName, fallback = "") {
  const value = source?.[fieldName];
  return typeof value === "string" ? value : fallback;
}

function pickArray(source, fieldName) {
  const value = source?.[fieldName];
  return Array.isArray(value) ? value : [];
}

function pickIsoString(value, fallback) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return fallback;
}

function formatProjectTitle(keyword) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const base = typeof keyword === "string" && keyword.trim() ? keyword.trim() : "未命名项目";
  return `${base} @ ${stamp}`;
}

function generateProjectId() {
  return `proj-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeImagePayload(value) {
  if (!assertObject(value)) return null;

  const image = {
    src: pickString(value, "src"),
    title: pickString(value, "title"),
    alt: pickString(value, "alt"),
    fileName: pickString(value, "fileName"),
    mimeType: pickString(value, "mimeType"),
  };

  const byteLength = Number(value.byteLength);
  if (Number.isFinite(byteLength) && byteLength >= 0) {
    image.byteLength = byteLength;
  }

  return image;
}

function normalizeImageSetItem(value, index) {
  if (!assertObject(value)) return null;

  const role = value.role === "cover" ? "cover" : "inner";
  return {
    id: pickString(value, "id") || `img-${index + 1}`,
    role,
    title: pickString(value, "title"),
    prompt: pickString(value, "prompt"),
    image: normalizeImagePayload(value.image),
  };
}

function normalizeImageSet(value) {
  if (!assertObject(value)) {
    return { styleGuide: "", items: [] };
  }

  const items = Array.isArray(value.items)
    ? value.items.map((item, index) => normalizeImageSetItem(item, index)).filter(Boolean)
    : [];

  return {
    styleGuide: pickString(value, "styleGuide"),
    items,
  };
}

function normalizeProject(raw, { existing } = {}) {
  if (!assertObject(raw)) {
    throw new CodexApiError("BAD_REQUEST", "project 必须是 JSON 对象。");
  }

  const now = new Date().toISOString();
  const rawId = pickString(raw, "id");
  if (rawId && !PROJECT_ID_PATTERN.test(rawId)) {
    throw new CodexApiError("BAD_REQUEST", "project.id 格式无效。");
  }

  const project = {
    id: rawId || existing?.id || generateProjectId(),
    title: pickString(raw, "title", existing?.title ?? "") || formatProjectTitle(raw.keyword),
    createdAt: pickIsoString(raw.createdAt, existing?.createdAt ?? now),
    updatedAt: now,
    imageSet: normalizeImageSet(raw.imageSet),
  };

  for (const field of PROJECT_STRING_FIELDS) {
    project[field] = pickString(raw, field, existing?.[field] ?? "");
  }

  for (const field of PROJECT_ARRAY_FIELDS) {
    project[field] = pickArray(raw, field);
  }

  return project;
}

export function createEmptyWorkspace() {
  return {
    version: WORKSPACE_VERSION,
    activeProjectId: "",
    projects: [],
  };
}

function normalizeWorkspace(raw) {
  if (!assertObject(raw) || !Array.isArray(raw.projects)) {
    return null;
  }

  const projects = [];
  for (const project of raw.projects) {
    if (!assertObject(project)) continue;
    try {
      projects.push(normalizeProject(project));
    } catch {
      // Skip malformed entries instead of discarding the whole workspace.
    }
  }

  const activeProjectId = pickString(raw, "activeProjectId");
  return {
    version: WORKSPACE_VERSION,
    activeProjectId: projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : "",
    projects,
  };
}

export async function readWorkspace() {
  let contents;
  try {
    contents = await readFile(workspacePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return createEmptyWorkspace();
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    parsed = null;
  }

  const workspace = parsed ? normalizeWorkspace(parsed) : null;
  if (workspace) return workspace;

  const brokenPath = `${workspacePath}.broken-${Date.now()}`;
  try {
    await rename(workspacePath, brokenPath);
  } catch {
    // Keep going: a missing backup must not block the app.
  }
  console.warn(`[store] workspace.json 无法解析，已备份到 ${brokenPath} 并重建空工作区。`);
  return createEmptyWorkspace();
}

export async function writeWorkspace(workspace) {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${workspacePath}.tmp-${process.pid}-${Date.now()}`;
  const payload = `${JSON.stringify(workspace, null, 2)}\n`;
  await writeFile(tmpPath, payload, "utf8");
  await rename(tmpPath, workspacePath);
  return workspace;
}

function requireProjectId(value, fieldName = "projectId") {
  const projectId = typeof value === "string" ? value.trim() : "";
  if (!projectId) {
    throw new CodexApiError("BAD_REQUEST", `请提供${fieldName}。`);
  }
  return projectId;
}

export async function applyStoreAction(payload) {
  if (!assertObject(payload)) {
    throw new CodexApiError("BAD_REQUEST", "请求体必须是 JSON 对象。");
  }

  const action = typeof payload.action === "string" ? payload.action.trim() : "";
  const workspace = await readWorkspace();

  if (action === "saveProject") {
    const rawProject = assertObject(payload.project) ? payload.project : null;
    if (!rawProject) {
      throw new CodexApiError("BAD_REQUEST", "saveProject 需要 project 对象。");
    }

    const rawId = pickString(rawProject, "id");
    const existing = rawId ? workspace.projects.find((project) => project.id === rawId) : null;
    const project = normalizeProject(rawProject, { existing });

    const index = workspace.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) {
      workspace.projects[index] = project;
    } else {
      workspace.projects.push(project);
    }
    workspace.activeProjectId = workspace.activeProjectId || project.id;

    return writeWorkspace(workspace);
  }

  if (action === "deleteProject") {
    const projectId = requireProjectId(payload.projectId);
    const remaining = workspace.projects.filter((project) => project.id !== projectId);

    if (remaining.length === workspace.projects.length) {
      throw new CodexApiError("BAD_REQUEST", "projectId 对应的项目不存在。");
    }

    workspace.projects = remaining;
    if (workspace.activeProjectId === projectId) {
      workspace.activeProjectId = "";
    }
    return writeWorkspace(workspace);
  }

  if (action === "setActive") {
    const projectId = requireProjectId(payload.projectId);
    if (!workspace.projects.some((project) => project.id === projectId)) {
      throw new CodexApiError("BAD_REQUEST", "projectId 对应的项目不存在。");
    }

    workspace.activeProjectId = projectId;
    return writeWorkspace(workspace);
  }

  throw new CodexApiError("BAD_REQUEST", "action 必须是 saveProject、deleteProject 或 setActive。");
}

export { workspacePath };
