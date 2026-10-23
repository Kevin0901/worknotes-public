import "server-only";
import { cache } from "react";
import { db } from "./db";
import { hasDatabase } from "./env";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  siteTitle: "工作筆記",
  requireLogin: true,
  allowRegistration: true,
  logPageViews: true,
  logRetentionDays: 90,
};

const KEY_MAP: Record<keyof Settings, string> = {
  siteTitle: "site_title",
  requireLogin: "require_login",
  allowRegistration: "allow_registration",
  logPageViews: "log_page_views",
  logRetentionDays: "log_retention_days",
};

/** 讀取系統設定；資料庫未設定或連線失敗時採用安全的預設值（需登入） */
export const getSettings = cache(async (): Promise<Settings> => {
  if (!hasDatabase()) return { ...DEFAULT_SETTINGS };
  try {
    const sql = await db();
    const rows = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM app_settings`;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const result = { ...DEFAULT_SETTINGS };
    for (const [prop, key] of Object.entries(KEY_MAP) as [keyof Settings, string][]) {
      const v = map.get(key);
      if (v === undefined || v === null) continue;
      if (typeof v === typeof DEFAULT_SETTINGS[prop]) (result as Record<string, unknown>)[prop] = v;
    }
    return result;
  } catch (err) {
    console.error("[settings] 讀取失敗", err);
    return { ...DEFAULT_SETTINGS };
  }
});

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const sql = await db();
  for (const [prop, value] of Object.entries(patch) as [keyof Settings, unknown][]) {
    const key = KEY_MAP[prop];
    if (!key || value === undefined) continue;
    await sql`
      INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${sql.json(value as never)}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }
}

export async function getRawSetting(key: string): Promise<unknown> {
  const sql = await db();
  const rows = await sql<{ value: unknown }[]>`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows[0]?.value;
}

export async function setRawSetting(key: string, value: unknown): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${sql.json(value as never)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
