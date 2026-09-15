export const STORAGE_PREFIX = "lime-desk-v1";

// 改名「薄荷工坊 / Mint Atelier → 青柠工作台 / Lime Desk」前的旧前缀，用于一次性数据迁移。
export const LEGACY_STORAGE_PREFIXES = ["mint-atelier-v2"];

export const API_BASE_STORAGE_KEY = `${STORAGE_PREFIX}:apiBase`;

export function buildStorageKey(key) {
  return `${STORAGE_PREFIX}:${key}`;
}

/**
 * 把旧品牌前缀下的 localStorage 数据复制到新前缀（不删除旧键，便于回滚到旧版本仍能读到）。
 * 在应用挂载前调用，避免已保存的人设、关键词、撰写思路和模型配置因改名丢失。
 */
export function migrateLegacyStorage() {
  if (typeof window === "undefined" || !window.localStorage) return 0;

  let migrated = 0;
  try {
    for (const legacyPrefix of LEGACY_STORAGE_PREFIXES) {
      const legacyKeys = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(`${legacyPrefix}:`)) legacyKeys.push(key);
      }

      for (const legacyKey of legacyKeys) {
        const nextKey = `${STORAGE_PREFIX}${legacyKey.slice(legacyPrefix.length)}`;
        if (window.localStorage.getItem(nextKey) !== null) continue;
        const value = window.localStorage.getItem(legacyKey);
        if (value === null) continue;
        window.localStorage.setItem(nextKey, value);
        migrated += 1;
      }
    }
  } catch {
    // localStorage 不可用（隐私模式、嵌入上下文）时跳过迁移。
  }

  return migrated;
}
