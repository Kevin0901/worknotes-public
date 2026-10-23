import "server-only";
// 使用者自己的 AI API 金鑰（加密後存在資料庫）
// - 只有金鑰擁有者本人能列出、使用、刪除；管理員後台也看不到內容。
// - 列表與 API 回應只包含提示（前後 4 碼），永遠不回傳金鑰本身。
// - 到期的金鑰會被刪除；刪除是直接 DELETE（不進垃圾桶）。
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { HttpError } from "../http";
import { RETENTION_DAYS, isProviderId, type CredentialInfo, type KeyRetention, type ProviderId } from "./catalog";
import { credentialAad, decryptSecret, encryptSecret, keyHint } from "./crypto";

const MAX_PER_USER = 20;
const NO_KEY_HINT = "（無金鑰）";
const COLUMNS = ["id", "provider", "label", "key_hint", "secret", "base_url", "direct", "created_at", "last_used_at", "expires_at"];

interface Row {
  id: string;
  provider: string;
  label: string | null;
  key_hint: string;
  secret: string;
  base_url: string | null;
  direct: boolean;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
}

const toInfo = (r: Row): CredentialInfo => ({
  id: r.id,
  provider: (isProviderId(r.provider) ? r.provider : "openai") as ProviderId,
  label: r.label,
  hint: r.key_hint,
  baseUrl: r.base_url,
  direct: r.direct,
  hasKey: r.key_hint !== NO_KEY_HINT,
  createdAt: r.created_at.toISOString(),
  lastUsedAt: r.last_used_at?.toISOString() ?? null,
  expiresAt: r.expires_at?.toISOString() ?? null,
});

/** 金鑰格式的基本檢查：可見 ASCII、無空白，長度合理 */
export function normalizeApiKey(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "請輸入 API 金鑰");
  const key = value.trim();
  if (key.length < 20 || key.length > 400 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new HttpError(400, "API 金鑰格式不正確（請確認沒有多複製到空白或其他文字）");
  }
  return key;
}

/** 自訂端點的金鑰可以不填（例如 Ollama）；有填時只檢查字元與長度 */
export function normalizeOptionalKey(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new HttpError(400, "API 金鑰格式不正確");
  const key = value.trim();
  if (key.length > 400 || (key && !/^[!-~]+$/.test(key))) throw new HttpError(400, "API 金鑰格式不正確（請確認沒有多複製到空白或其他文字）");
  return key;
}

async function purgeExpired(): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM ai_credentials WHERE expires_at IS NOT NULL AND expires_at < now()`;
}

export async function listCredentials(userId: string): Promise<CredentialInfo[]> {
  await purgeExpired();
  const sql = await db();
  const rows = await sql<Row[]>`
    SELECT ${sql(COLUMNS)} FROM ai_credentials WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return rows.map(toInfo);
}

export async function saveCredential(
  userId: string,
  input: {
    provider: ProviderId;
    apiKey: string;
    label: string | null;
    retention: Exclude<KeyRetention, "session">;
    /** 自訂端點才有 */
    baseUrl?: string | null;
    direct?: boolean;
  },
): Promise<CredentialInfo> {
  const sql = await db();
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM ai_credentials WHERE user_id = ${userId}`;
  if (count >= MAX_PER_USER) throw new HttpError(400, `最多只能儲存 ${MAX_PER_USER} 把金鑰，請先刪除不用的金鑰`);
  const id = randomUUID();
  const baseUrl = input.baseUrl ?? null;
  // 直連（本機）端點的金鑰不能存在伺服器：瀏覽器需要明文才能呼叫，而本站不會把金鑰傳回瀏覽器
  if (input.direct && input.apiKey) throw new HttpError(400, "瀏覽器直連的端點不能儲存金鑰，請改用「不儲存」");
  const secret = encryptSecret(input.apiKey, credentialAad(userId, input.provider, id, baseUrl));
  const days = RETENTION_DAYS[input.retention];
  const rows = await sql<Row[]>`
    INSERT INTO ai_credentials (id, user_id, provider, label, key_hint, secret, base_url, direct, expires_at)
    VALUES (${id}, ${userId}, ${input.provider}, ${input.label}, ${input.apiKey ? keyHint(input.apiKey) : NO_KEY_HINT}, ${secret},
      ${baseUrl}, ${!!input.direct}, ${days ? sql`now() + make_interval(days => ${days})` : null})
    RETURNING ${sql(COLUMNS)}`;
  return toInfo(rows[0]);
}

/** 取出並解密金鑰（只在伺服器端呼叫供應商時使用） */
export async function openCredential(
  userId: string,
  id: string,
): Promise<{ provider: ProviderId; apiKey: string; baseUrl: string | null; info: CredentialInfo }> {
  await purgeExpired();
  const sql = await db();
  const rows = await sql<Row[]>`SELECT ${sql(COLUMNS)} FROM ai_credentials WHERE id = ${id} AND user_id = ${userId}`;
  const row = rows[0];
  if (!row || !isProviderId(row.provider)) throw new HttpError(404, "找不到這把金鑰（可能已刪除或已到期）");
  // 瀏覽器直連的本機端點：伺服器不會代為呼叫（也沒有金鑰）
  if (row.direct) throw new HttpError(400, "這個端點由瀏覽器直接連線，本站伺服器不會代為呼叫");
  const apiKey = decryptSecret(row.secret, credentialAad(userId, row.provider, row.id, row.base_url));
  if (apiKey === null) throw new HttpError(409, "這把金鑰無法解密（伺服器加密金鑰已更換或資料被修改），請刪除後重新輸入");
  await sql`UPDATE ai_credentials SET last_used_at = now() WHERE id = ${id}`;
  return { provider: row.provider, apiKey, baseUrl: row.base_url, info: toInfo(row) };
}

/** 直連端點只記錄使用時間（伺服器不會呼叫它） */
export async function touchCredential(userId: string, id: string): Promise<CredentialInfo> {
  const sql = await db();
  const rows = await sql<Row[]>`
    UPDATE ai_credentials SET last_used_at = now() WHERE id = ${id} AND user_id = ${userId} RETURNING ${sql(COLUMNS)}`;
  if (!rows[0]) throw new HttpError(404, "找不到這個端點（可能已刪除或已到期）");
  return toInfo(rows[0]);
}

export async function deleteCredential(userId: string, id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`DELETE FROM ai_credentials WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

export async function deleteAllCredentials(userId: string): Promise<number> {
  const sql = await db();
  const rows = await sql`DELETE FROM ai_credentials WHERE user_id = ${userId} RETURNING id`;
  return rows.length;
}
