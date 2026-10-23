import type { NextRequest } from "next/server";
import { rateLimit, requireAiViewer, requireUserId } from "@/lib/ai/api";
import { PROVIDER_BY_ID, RETENTION_OPTIONS, isProviderId, type KeyRetention } from "@/lib/ai/catalog";
import { canEncrypt } from "@/lib/ai/crypto";
import { deleteAllCredentials, listCredentials, normalizeApiKey, normalizeOptionalKey, saveCredential } from "@/lib/ai/credentials";
import { normalizeBaseUrl } from "@/lib/ai/endpoint";
import { listModels, ProviderError } from "@/lib/ai/providers";
import { HttpError, json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";

/** 我的金鑰（只有提示，沒有金鑰本身） */
export const GET = route(async () => {
  const { userId } = await requireAiViewer();
  return json({
    credentials: userId ? await listCredentials(userId) : [],
    canStore: !!userId && canEncrypt(),
  });
});

/**
 * 新增金鑰：先用金鑰向供應商取得模型清單（同時驗證金鑰有效），
 * retention 為 session 時不儲存，只回傳模型清單；其餘加密後儲存。
 */
export const POST = route(async (req: NextRequest) => {
  const { viewer, userId } = await requireAiViewer();
  rateLimit(viewer.actor ?? "anon", 10, "ai-key");
  const body = await readJson(req, 10_000);
  if (!isProviderId(body.provider)) throw new HttpError(400, "請選擇 AI 供應商");
  const provider = body.provider;
  const retention = RETENTION_OPTIONS.some((o) => o.value === body.retention) ? (body.retention as KeyRetention) : "session";
  const label = str(body.label, "名稱", { max: 40 }) || null;
  // 自訂端點：direct = 瀏覽器直連的本機服務（伺服器不連線、不存金鑰）；否則由伺服器代連公開的 https 網址
  const direct = provider === "custom" && body.direct === true;
  const baseUrl = provider === "custom" ? normalizeBaseUrl(body.baseUrl, direct ? "direct" : "server") : null;
  const apiKey = provider === "custom" ? normalizeOptionalKey(body.apiKey) : normalizeApiKey(body.apiKey);
  // 要儲存時先確認身分與伺服器設定，再把金鑰送去供應商驗證
  if (retention !== "session") {
    requireUserId(userId);
    if (!canEncrypt()) throw new HttpError(503, "伺服器未設定加密金鑰，目前只能使用「不儲存」模式");
  }

  if (direct) {
    // 本機服務由瀏覽器自己驗證與列出模型；伺服器只保存網址（不保存金鑰）
    if (retention === "session") return json({ credential: null, models: [] });
    if (apiKey) throw new HttpError(400, "瀏覽器直連的端點不能儲存金鑰，請改用「不儲存」");
    const credential = await saveCredential(requireUserId(userId), { provider, apiKey: "", label, retention, baseUrl, direct: true });
    await logEvent({ event: "ai_key_add", path: "/ai/keys", method: "POST", detail: `本機端點 ${baseUrl}（${retention}）` }, viewer);
    return json({ credential, models: [] });
  }

  let models;
  try {
    models = await listModels(provider, apiKey, baseUrl);
  } catch (err) {
    if (err instanceof ProviderError) throw new HttpError(err.status === 401 ? 400 : err.status, err.message);
    throw err;
  }

  if (retention === "session") return json({ credential: null, models });

  const credential = await saveCredential(requireUserId(userId), { provider, apiKey, label, retention, baseUrl });
  const where = baseUrl ? ` ${new URL(baseUrl).host}` : "";
  await logEvent(
    { event: "ai_key_add", path: "/ai/keys", method: "POST", detail: `${PROVIDER_BY_ID.get(provider)?.short}${where}（${credential.hint}，${retention}）` },
    viewer,
  );
  return json({ credential, models });
});

/** 刪除我所有的金鑰 */
export const DELETE = route(async () => {
  const { viewer, userId } = await requireAiViewer();
  const count = await deleteAllCredentials(requireUserId(userId));
  await logEvent({ event: "ai_key_delete", path: "/ai/keys", method: "DELETE", detail: `全部（${count} 把）` }, viewer);
  return json({ deleted: count });
});
