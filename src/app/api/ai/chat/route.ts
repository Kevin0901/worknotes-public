import type { NextRequest } from "next/server";
import { rateLimit, requireAiViewer, resolveKey } from "@/lib/ai/api";
import { PROVIDER_BY_ID } from "@/lib/ai/catalog";
import { prepareChat } from "@/lib/ai/chat";
import { appendMessage } from "@/lib/ai/conversations";
import { redactSecrets } from "@/lib/ai/crypto";
import { ProviderError, streamChat } from "@/lib/ai/providers";
import { appOrigin } from "@/lib/env";
import { readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";

export const maxDuration = 300;

/**
 * 串流對話（由本站伺服器呼叫 AI 供應商）。回應為 NDJSON（每行一個 JSON）：
 * meta（對話 id、參考來源）→ delta（文字片段）／reset（改由其他模型回答）→ done 或 error
 */
export const POST = route(async (req: NextRequest) => {
  const { viewer, userId } = await requireAiViewer();
  rateLimit(viewer.actor ?? "anon", 20, "ai-chat");
  const body = await readJson(req, 1_200_000);
  const { provider, apiKey, baseUrl } = await resolveKey(userId, body);
  const info = PROVIDER_BY_ID.get(provider)!;
  const prepared = await prepareChat(userId, provider, body);
  const { conversationId, model, sources } = prepared;

  await logEvent({ event: "ai_chat", path: "/ai", method: "POST", detail: `${info.short} / ${model}（參考 ${sources.length} 筆）` }, viewer);

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const origin = appOrigin(req.headers);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* 用戶端已中斷 */
        }
      };
      send({ type: "meta", conversationId, sources, provider, model });
      let text = "";
      let error: string | null = null;
      let notice: string | null = null;
      try {
        for await (const ev of streamChat({
          provider, apiKey, baseUrl, model, system: prepared.system, messages: prepared.messages,
          maxOutputTokens: prepared.maxOutputTokens, signal: abort.signal, appOrigin: origin,
        })) {
          if (ev.type === "text") {
            text += ev.text;
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "reset") {
            text = "";
            notice = ev.note;
            send({ type: "reset", note: ev.note });
          } else if (ev.type === "end") {
            if (ev.stopReason === "refusal") notice = "模型拒絕回答這個問題。";
            else if (ev.stopReason === "max_tokens" || ev.stopReason === "length" || ev.stopReason === "MAX_TOKENS") notice = "回答已達長度上限，內容可能不完整。";
            else if (ev.stopReason === "SAFETY") notice = "回答因安全設定被中斷。";
          }
        }
      } catch (err) {
        if (err instanceof ProviderError) error = err.status === 499 ? null : err.message;
        else {
          console.error("[ai-chat]", redactSecrets(String(err), apiKey));
          error = "AI 服務發生錯誤，請稍後再試";
        }
      }
      let messageId: string | null = null;
      if (conversationId && (text || error)) {
        const suffix = abort.signal.aborted ? "\n\n（已停止回答）" : error ? `\n\n（錯誤：${error}）` : notice ? `\n\n（${notice}）` : "";
        try {
          messageId = await appendMessage(conversationId, { role: "assistant", content: text + suffix, sources, provider, model });
        } catch (err) {
          console.error("[ai-chat] 儲存回答失敗", err);
        }
      }
      if (error) send({ type: "error", message: error });
      else send({ type: "done", messageId, notice });
      try {
        controller.close();
      } catch {
        /* 已關閉 */
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
