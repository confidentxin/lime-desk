import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexApiError } from "./codex/validation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(repoRoot, "data", "generated");
const outputDir = path.join(repoRoot, "output");
const PNG_FILE_NAME_PATTERN = /^cover-\d+-[a-f0-9-]+\.png$/i;

function assertObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source, fieldName) {
  const value = source?.[fieldName];
  return typeof value === "string" ? value.trim() : "";
}

function compactText(value, maxLength = 200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function compactMultiline(value, maxLength = 6000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function formatSlugStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function buildExportSlug(projectId) {
  const safeId = String(projectId ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  const base = safeId || "project";
  return `${base}-${formatSlugStamp()}`;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeExportImageSet(imageSet) {
  if (!assertObject(imageSet)) {
    return { styleGuide: "", items: [] };
  }

  const items = Array.isArray(imageSet.items)
    ? imageSet.items.filter(assertObject).map((item, index) => ({
        id: pickString(item, "id") || `img-${index + 1}`,
        role: item.role === "cover" ? "cover" : "inner",
        title: pickString(item, "title"),
        prompt: pickString(item, "prompt"),
        fileName: pickString(assertObject(item.image) ? item.image : {}, "fileName"),
      }))
    : [];

  return {
    styleGuide: pickString(imageSet, "styleGuide"),
    items,
  };
}

function validateExportRequest(payload) {
  if (!assertObject(payload)) {
    throw new CodexApiError("BAD_REQUEST", "请求体必须是 JSON 对象。");
  }

  const title = pickString(payload, "title");
  if (!title) {
    throw new CodexApiError("BAD_REQUEST", "请提供笔记标题。");
  }

  const body = compactMultiline(payload.body);
  if (!body) {
    throw new CodexApiError("BAD_REQUEST", "请提供笔记正文。");
  }

  return {
    projectId: pickString(payload, "projectId"),
    title,
    body,
    tags: normalizeTags(payload.tags),
    imageSet: normalizeExportImageSet(payload.imageSet),
  };
}

function renderNoteMarkdown({ title, body, tags, imageSet, skipped }) {
  const skippedSet = new Set(skipped);
  const lines = [`# ${title}`, "", body, ""];

  if (tags.length > 0) {
    lines.push("## 话题", "", tags.map((tag) => `#${tag}`).join(" "), "");
  }

  if (imageSet.styleGuide) {
    lines.push("## 统一视觉规范", "", imageSet.styleGuide, "");
  }

  if (imageSet.items.length > 0) {
    lines.push("## 配图清单", "", "| # | 角色 | 标题 | 图片文件 |", "| --- | --- | --- | --- |");
    imageSet.items.forEach((item, index) => {
      const roleLabel = item.role === "cover" ? "封面" : "内页";
      let imageCell = "（未生成）";
      if (item.fileName) {
        imageCell = skippedSet.has(item.fileName)
          ? `（未找到：${item.fileName}）`
          : `images/${item.fileName}`;
      }
      lines.push(`| ${index + 1} | ${roleLabel} | ${compactText(item.title, 80)} | ${imageCell} |`);
    });
    lines.push("");

    lines.push("## 配图说明", "");
    imageSet.items.forEach((item, index) => {
      const roleLabel = item.role === "cover" ? "封面" : "内页";
      lines.push(`${index + 1}. **${roleLabel} · ${compactText(item.title, 80)}**`, "");
      lines.push(`   ${compactText(item.prompt, 400) || "（无 Prompt）"}`, "");
    });
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

async function copySetImages(imageSet, imagesDir) {
  const files = [];
  const skipped = [];

  for (const item of imageSet.items) {
    if (!item.fileName) continue;

    if (!PNG_FILE_NAME_PATTERN.test(item.fileName)) {
      skipped.push(item.fileName);
      continue;
    }

    const sourcePath = path.join(generatedDir, item.fileName);
    try {
      const stats = await stat(sourcePath);
      if (!stats.isFile()) {
        skipped.push(item.fileName);
        continue;
      }
    } catch {
      skipped.push(item.fileName);
      continue;
    }

    const targetPath = path.join(imagesDir, item.fileName);
    await copyFile(sourcePath, targetPath);
    files.push(`images/${item.fileName}`);
  }

  return { files, skipped };
}

export async function exportNote(payload) {
  const { projectId, title, body, tags, imageSet } = validateExportRequest(payload);
  const slug = buildExportSlug(projectId);
  const exportDir = path.join(outputDir, slug);
  const imagesDir = path.join(exportDir, "images");

  await mkdir(imagesDir, { recursive: true });

  const { files: imageFiles, skipped } = await copySetImages(imageSet, imagesDir);
  const notePath = path.join(exportDir, "note.md");
  await writeFile(notePath, renderNoteMarkdown({ title, body, tags, imageSet, skipped }), "utf8");

  return {
    exportDir,
    slug,
    files: ["note.md", ...imageFiles],
    skipped,
  };
}

export { outputDir };
