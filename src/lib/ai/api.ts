import "server-only";
import { getViewer, type Viewer } from "../auth";
import { HttpError, isUuid } from "../http";
import { isProviderId, type ProviderId } from "./catalog";
import { normalizeApiKey, normalizeOptionalKey, openCredential } from "./credentials";
import { normalizeBaseUrl } from "./endpoint";

/**
 * AI 助理必須登入（Google 帳號或後台管理員）；即使網站設定為「不需登入即可瀏覽」，訪客也不能使用。
 * 儲存金鑰、對話紀錄需要 Google 帳號（userId）；後台管理員只能使用「不儲存」的金鑰。
 */
export async function requireAiViewer(): Promise<{ viewer: Viewer; userId: string | null }> {
  const viewer = await getViewer();
  if (!viewer.user && !viewer.admin) throw new HttpError(401, "請先登入");
  return { viewer, userId: viewer.user?.id ?? null };
}

export function requireUserId(userId: string | null): string {
  if (!userId) throw new HttpError(403, "儲存金鑰與對話紀錄需要以 Google 帳號登入（後台管理員帳號只能使用不儲存的金鑰）");
  return userId;
}

/** 每位使用者每分鐘的請求上限（各伺服器執行個體分別計算，用來擋住意外的連續送出） */
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function rateLimit(actor: string, max: number, bucket: string): void {
  const now = Date.now();
  const key = `${bucket}:${actor}`;
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= max) throw new HttpError(429, "送出太頻繁，請稍等一分鐘再試");
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
}

/**
 * 取得這次要用的金鑰：已儲存的（credentialId）或本次分頁暫存的（provider＋apiKey）。
 * 自訂端點另外帶 baseUrl（伺服器代連，只允許公開的 https 網址）；
 * 瀏覽器直連的本機端點不會經過這裡（伺服器連不到使用者的電腦）。
 */
export async function resolveKey(
  userId: string | null,
  body: Record<string, unknown>,
): Promise<{ provider: ProviderId; apiKey: string; baseUrl: string | null; credentialId: string | null }> {
  if (body.credentialId !== undefined && body.credentialId !== null) {
    if (!isUuid(body.credentialId)) throw new HttpError(400, "金鑰參數錯誤");
    const uid = requireUserId(userId);
    const c = await openCredential(uid, body.credentialId);
    if (c.info.direct) throw new HttpError(400, "這個端點由瀏覽器直接連線，本站伺服器不會代為呼叫");
    // 儲存時已檢查過；再檢查一次，確保資料庫中的網址仍符合規則
    const baseUrl = c.provider === "custom" ? normalizeBaseUrl(c.baseUrl, "server") : null;
    return { provider: c.provider, apiKey: c.apiKey, baseUrl, credentialId: body.credentialId };
  }
  if (!isProviderId(body.provider)) throw new HttpError(400, "請選擇 AI 供應商");
  if (body.provider === "custom") {
    return { provider: "custom", apiKey: normalizeOptionalKey(body.apiKey), baseUrl: normalizeBaseUrl(body.baseUrl, "server"), credentialId: null };
  }
  return { provider: body.provider, apiKey: normalizeApiKey(body.apiKey), baseUrl: null, credentialId: null };
}
