import "server-only";
// 呼叫各家 AI 供應商（只在伺服器端執行，金鑰不回傳給瀏覽器）
//
// 資安原則：
// - 只連線到下方寫死的官方網址（不接受使用者自訂網址，避免 SSRF）；不跟隨轉址。
// - 金鑰只放在 HTTP 標頭，不放在網址（避免出現在記錄檔）。
// - 供應商的錯誤訊息回傳前會先遮蔽金鑰。
import Anthropic from "@anthropic-ai/sdk";
import { PROVIDER_BY_ID, type ModelInfo, type ProviderId } from "./catalog";
import { redactSecrets } from "./crypto";
import { isBlockedError, safeFetch } from "./endpoint";

export class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type ChatEvent =
  | { type: "text"; text: string }
  /** Claude 拒答後由伺服器端改用其他模型重答：前端要清掉已顯示的部分內容 */
  | { type: "reset"; note: string }
  | { type: "end"; stopReason: string | null };

/** OpenAI 相容 API（Chat Completions）的固定網址 */
const OPENAI_COMPATIBLE: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  mistral: "https://api.mistral.ai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function friendly(provider: ProviderId, status: number, raw: string, apiKey: string): ProviderError {
  const name = PROVIDER_BY_ID.get(provider)?.short ?? provider;
  const detail = redactSecrets(raw, apiKey).replace(/\s+/g, " ").slice(0, 300);
  const suffix = detail ? `（${name}：${detail}）` : "";
  if (status === 401 || status === 403) return new ProviderError(401, `API 金鑰無效、已停用，或沒有使用這個模型的權限${suffix}`);
  if (status === 402) return new ProviderError(402, `帳戶點數不足，請到 ${name} 儲值或改用免費模型${suffix}`);
  if (status === 404) return new ProviderError(404, `找不到這個模型，或你的金鑰無法使用它${suffix}`);
  if (status === 429) return new ProviderError(429, `已達 ${name} 的使用額度或速率上限，請稍後再試，或改用其他模型${suffix}`);
  if (status === 400 || status === 413 || status === 422) return new ProviderError(400, `請求被 ${name} 拒絕，可能是內容太長或參數不支援${suffix}`);
  if (status >= 500) return new ProviderError(502, `${name} 暫時無法服務，請稍後再試${suffix}`);
  return new ProviderError(502, `${name} 回應錯誤（HTTP ${status}）${suffix}`);
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === "string") return j.error;
    return j.error?.message || j.message || text;
  } catch {
    return text;
  }
}

async function call(provider: ProviderId, url: string, init: RequestInit & { apiKey: string }): Promise<Response> {
  const { apiKey, ...rest } = init;
  let res: Response;
  try {
    // 自訂端點的網址來自使用者：改用 safeFetch（檢查解析出的 IP 必須是公開位址、不轉址、限制大小）
    res =
      provider === "custom"
        ? await safeFetch(url, {
            method: rest.method,
            headers: rest.headers as Record<string, string> | undefined,
            body: typeof rest.body === "string" ? rest.body : undefined,
            signal: rest.signal ?? undefined,
          })
        : await fetch(url, { ...rest, redirect: "error", cache: "no-store" });
  } catch (err) {
    if ((err as Error).name === "AbortError" || (err as Error).name === "TimeoutError") throw new ProviderError(504, "連線逾時或已取消");
    if (isBlockedError(err)) throw new ProviderError(400, err.message);
    throw new ProviderError(502, `無法連線到 ${PROVIDER_BY_ID.get(provider)?.short ?? provider}${provider === "custom" ? "（請確認網址與服務狀態）" : ""}`);
  }
  // 自訂端點不該回應轉址；視為錯誤，不跟隨
  if (provider === "custom" && res.status >= 300 && res.status < 400) throw new ProviderError(400, "API 網址回應轉址，請直接輸入最終的網址");
  if (!res.ok) throw friendly(provider, res.status, await errorText(res), apiKey);
  return res;
}

const authHeaders = (provider: ProviderId, apiKey: string): Record<string, string> =>
  provider === "gemini" ? { "x-goog-api-key": apiKey } : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

// ───────────── 模型清單（同時用來驗證金鑰） ─────────────

/** 非對話用途的模型（嵌入、語音、影像、審核等），不列出 */
const NON_CHAT = /(embed|whisper|tts|transcribe|dall-e|image|moderation|realtime|audio|rerank|reward|guard|safety|clip|vision-only|search-preview|computer-use|ocr|parse|retriever|nemoretriever|vila|deplot|kosmos|paligemma|sdxl|flux|stable-diffusion|veo|imagen|lyria|aqa|codestral-embed)/i;

function byName(a: ModelInfo, b: ModelInfo) {
  return a.name.localeCompare(b.name, "en");
}

/** maxRetries 0：不自動重送（避免重複扣使用者的額度）；一律明確傳入 apiKey，不讀取伺服器的環境變數 */
function anthropicClient(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 0, timeout: 120_000 });
}

function anthropicError(err: unknown, apiKey: string): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError")) return new ProviderError(499, "已取消");
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError(504, "連線逾時");
  if (err instanceof Anthropic.APIError && err.status) {
    const raw = (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
    return friendly("anthropic", err.status, raw, apiKey);
  }
  return new ProviderError(502, "無法連線到 Claude");
}

export async function listModels(provider: ProviderId, apiKey: string, baseUrl?: string | null): Promise<ModelInfo[]> {
  const signal = AbortSignal.timeout(20_000);
  if (provider === "anthropic") {
    try {
      const out: ModelInfo[] = [];
      for await (const m of anthropicClient(apiKey).models.list({ limit: 100 }, { signal })) {
        out.push({ id: m.id, name: m.display_name || m.id, contextWindow: m.max_input_tokens ?? null, maxOutput: m.max_tokens ?? null });
        if (out.length >= 200) break;
      }
      return out;
    } catch (err) {
      throw anthropicError(err, apiKey);
    }
  }

  if (provider === "gemini") {
    const res = await call(provider, `${GEMINI_BASE}/models?pageSize=1000`, { headers: authHeaders(provider, apiKey), signal, apiKey });
    const body = (await res.json()) as {
      models?: { name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[] }[];
    };
    return (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && m.name.startsWith("models/") && !NON_CHAT.test(m.name))
      .map((m) => ({
        id: m.name.slice("models/".length),
        name: m.displayName || m.name,
        contextWindow: m.inputTokenLimit ?? null,
        maxOutput: m.outputTokenLimit ?? null,
      }))
      .sort(byName);
  }

  const base = provider === "custom" ? baseUrl : OPENAI_COMPATIBLE[provider];
  if (!base) throw new ProviderError(400, provider === "custom" ? "缺少 API 網址" : "不支援的供應商");

  if (provider === "openrouter") {
    // 模型清單是公開的，另外呼叫 /key 驗證金鑰是否有效
    await call(provider, `${base}/key`, { headers: authHeaders(provider, apiKey), signal, apiKey });
    const res = await call(provider, `${base}/models`, { signal, apiKey });
    const body = (await res.json()) as {
      data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; top_provider?: { max_completion_tokens?: number } }[];
    };
    return (body.data ?? [])
      .filter((m) => !NON_CHAT.test(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        contextWindow: m.context_length ?? null,
        maxOutput: m.top_provider?.max_completion_tokens ?? null,
        free: m.id.endsWith(":free") || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0),
      }))
      .sort((a, b) => Number(!!b.free) - Number(!!a.free) || byName(a, b));
  }

  const res = await call(provider, `${base}/models`, { headers: authHeaders(provider, apiKey), signal, apiKey });
  const body = (await res.json()) as {
    data?: { id: string; name?: string; context_window?: number; max_context_length?: number; active?: boolean; capabilities?: { completion_chat?: boolean } }[];
  };
  let models = (body.data ?? []).filter((m) => m.active !== false && !NON_CHAT.test(m.id));
  if (provider === "openai") models = models.filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id));
  if (provider === "mistral") models = models.filter((m) => m.capabilities?.completion_chat !== false);
  const seen = new Set<string>();
  return models
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .map((m) => ({ id: m.id, name: m.name || m.id, contextWindow: m.context_window ?? m.max_context_length ?? null, maxOutput: null }))
    .sort(byName);
}

// ───────────── 串流對話 ─────────────

/** 讀取 SSE（Server-Sent Events），逐筆回傳 data 內容 */
async function* sseData(res: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      if (signal.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let m: RegExpExecArray | null;
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const block = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (data) yield data;
      }
      if (buf.length > 2_000_000) throw new ProviderError(502, "回應格式錯誤");
    }
  } finally {
    reader.releaseLock();
  }
}

/** Claude 有伺服器端「拒答後改用其他模型」的模型（Anthropic 建議預設開啟） */
const CLAUDE_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-fable-5", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

async function* streamAnthropic(o: StreamOptions): AsyncGenerator<ChatEvent> {
  const client = anthropicClient(o.apiKey);
  const params = {
    model: o.model,
    max_tokens: o.maxOutputTokens,
    system: o.system,
    messages: o.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  // 兩種串流（一般／beta）的事件格式相同，這裡只取用需要的欄位
  type StreamEvent = {
    type: string;
    content_block?: { type: string; from?: { model?: string }; to?: { model?: string } };
    delta?: { type?: string; text?: string; stop_reason?: string | null };
  };
  try {
    // 支援的模型開啟伺服器端 fallbacks：被安全分類器拒答時，自動改由 Anthropic 建議的模型重答
    const stream = (
      CLAUDE_FALLBACK_MODELS.has(o.model)
        ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal: o.signal })
        : client.messages.stream(params, { signal: o.signal })
    ) as unknown as AsyncIterable<StreamEvent>;
    let stopReason: string | null = null;
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block?.type === "fallback") {
        const block = event.content_block;
        yield { type: "reset", note: `${block.from?.model ?? o.model} 未回答這個問題，已自動改由 ${block.to?.model ?? "其他模型"} 回答。` };
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        yield { type: "text", text: event.delta.text };
      } else if (event.type === "message_delta") {
        stopReason = event.delta?.stop_reason ?? stopReason;
      }
    }
    yield { type: "end", stopReason };
  } catch (err) {
    throw anthropicError(err, o.apiKey);
  }
}

async function* streamGemini(o: StreamOptions): AsyncGenerator<ChatEvent> {
  const res = await call("gemini", `${GEMINI_BASE}/models/${encodeURIComponent(o.model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { ...authHeaders("gemini", o.apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: o.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: o.maxOutputTokens },
    }),
    signal: o.signal,
    apiKey: o.apiKey,
  });
  let stopReason: string | null = null;
  for await (const data of sseData(res, o.signal)) {
    let j: {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      error?: { message?: string; code?: number };
    };
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.error) throw friendly("gemini", j.error.code ?? 502, j.error.message ?? "", o.apiKey);
    if (j.promptFeedback?.blockReason) throw new ProviderError(400, `Gemini 拒絕回答（${j.promptFeedback.blockReason}）`);
    const cand = j.candidates?.[0];
    for (const p of cand?.content?.parts ?? []) if (p.text && !p.thought) yield { type: "text", text: p.text };
    if (cand?.finishReason) stopReason = cand.finishReason;
  }
  yield { type: "end", stopReason };
}

async function* streamOpenAICompatible(o: StreamOptions): AsyncGenerator<ChatEvent> {
  const base = o.provider === "custom" ? o.baseUrl : OPENAI_COMPATIBLE[o.provider];
  if (!base) throw new ProviderError(400, o.provider === "custom" ? "缺少 API 網址" : "不支援的供應商");
  const body: Record<string, unknown> = {
    model: o.model,
    stream: true,
    messages: [{ role: "system", content: o.system }, ...o.messages],
  };
  // OpenAI 新模型（含推理模型）改用 max_completion_tokens；其他相容服務仍用 max_tokens
  if (o.provider === "openai") body.max_completion_tokens = o.maxOutputTokens;
  else body.max_tokens = o.maxOutputTokens;
  const headers: Record<string, string> = { ...authHeaders(o.provider, o.apiKey), "Content-Type": "application/json" };
  if (o.provider === "openrouter") {
    headers["X-Title"] = "WorkNotes";
    if (o.appOrigin) headers["HTTP-Referer"] = o.appOrigin;
  }
  const res = await call(o.provider, `${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal, apiKey: o.apiKey });
  let stopReason: string | null = null;
  for await (const data of sseData(res, o.signal)) {
    if (data === "[DONE]") break;
    let j: { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; error?: { message?: string; code?: number | string } };
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.error) throw friendly(o.provider, typeof j.error.code === "number" ? j.error.code : 502, j.error.message ?? "", o.apiKey);
    const choice = j.choices?.[0];
    if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
    if (choice?.finish_reason) stopReason = choice.finish_reason;
  }
  yield { type: "end", stopReason };
}

export interface StreamOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: string;
  messages: ChatTurn[];
  maxOutputTokens: number;
  signal: AbortSignal;
  appOrigin?: string;
  /** 自訂端點的 API 網址（已經過 normalizeBaseUrl 檢查） */
  baseUrl?: string | null;
}

export function streamChat(o: StreamOptions): AsyncGenerator<ChatEvent> {
  if (o.provider === "anthropic") return streamAnthropic(o);
  if (o.provider === "gemini") return streamGemini(o);
  return streamOpenAICompatible(o);
}

/** 模型 id 只允許常見字元，避免被拿來組出其他網址路徑 */
export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(id) && !id.includes("..");
}
