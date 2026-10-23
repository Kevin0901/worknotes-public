import type { NextRequest } from "next/server";
import { rateLimit, requireAiViewer, requireUserId } from "@/lib/ai/api";
import type { PreparedChat } from "@/lib/ai/catalog";
import { prepareChat } from "@/lib/ai/chat";
import { touchCredential } from "@/lib/ai/credentials";
import { normalizeBaseUrl } from "@/lib/ai/endpoint";
import { HttpError, isUuid, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";

/**
 * 瀏覽器直連（本機 Ollama 等）第一步：伺服器整理參考資料（只含看得到的內容）並保存使用者的問題，
 * 回傳要送給模型的訊息；之後由瀏覽器直接呼叫本機服務，完成後呼叫 /api/ai/chat/complete 保存回答。
 * 伺服器不會連線到使用者的電腦，也拿不到本機服務的金鑰。
 */
export const POST = route(async (req: NextRequest) => {
  const { viewer, userId } = await requireAiViewer();
  rateLimit(viewer.actor ?? "anon", 20, "ai-chat");
  const body = await readJson(req, 1_200_000);
  let endpoint: string;
  if (body.credentialId !== undefined && body.credentialId !== null) {
    if (!isUuid(body.credentialId)) throw new HttpError(400, "端點參數錯誤");
    const c = await touchCredential(requireUserId(userId), body.credentialId);
    if (!c.direct || !c.baseUrl) throw new HttpError(400, "這個端點不是瀏覽器直連");
    endpoint = c.baseUrl;
  } else {
    endpoint = normalizeBaseUrl(body.baseUrl, "direct");
  }
  const prepared = await prepareChat(userId, "custom", body);
  await logEvent(
    { event: "ai_chat", path: "/ai", method: "POST", detail: `瀏覽器直連 ${new URL(endpoint).host} / ${prepared.model}（參考 ${prepared.sources.length} 筆）` },
    viewer,
  );
  const result: PreparedChat = {
    conversationId: prepared.conversationId,
    system: prepared.system,
    messages: prepared.messages,
    sources: prepared.sources,
    maxOutputTokens: prepared.maxOutputTokens,
  };
  return json(result);
});
