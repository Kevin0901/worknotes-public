// 瀏覽器直連本機 AI 服務（Ollama、LM Studio、vLLM 等 OpenAI 相容 API）——只在瀏覽器執行。
// 本站伺服器在雲端，連不到使用者的電腦；所以由瀏覽器直接呼叫 http://localhost，資料不經過本站伺服器。
// 只允許 localhost／127.0.0.1／[::1]，不帶 Cookie、不送 Referer。
import { isLocalBaseUrl, type ModelInfo } from "./catalog";

export class DirectError extends Error {}

function networkHint(baseUrl: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "本站網址";
  return (
    `無法連線到 ${baseUrl}。請確認：① 本機服務已啟動；② 允許本站跨網域存取` +
    `（Ollama：把環境變數 OLLAMA_ORIGINS 設為 ${origin} 後重新啟動 Ollama；LM Studio：開啟 Enable CORS）；` +
    "③ Chrome 詢問「是否允許存取區域網路上的裝置」時選擇允許。"
  );
}

function assertLocal(baseUrl: string) {
  if (!isLocalBaseUrl(baseUrl)) throw new DirectError("瀏覽器直連只支援這台電腦上的服務（localhost 或 127.0.0.1）");
}

async function request(baseUrl: string, path: string, apiKey: string, init: RequestInit): Promise<Response> {
  assertLocal(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new DirectError(networkHint(baseUrl));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string };
      detail = typeof j.error === "string" ? j.error : j.error?.message || text;
    } catch {
      /* 不是 JSON */
    }
    if (apiKey) detail = detail.split(apiKey).join("[已遮蔽]");
    const prefix = res.status === 401 || res.status === 403 ? "金鑰錯誤或沒有權限" : res.status === 404 ? "找不到（請確認網址結尾是否為 /v1，或模型名稱）" : `HTTP ${res.status}`;
    throw new DirectError(`${prefix}${detail ? `：${detail.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
  }
  return res;
}

export async function listModelsDirect(baseUrl: string, apiKey = ""): Promise<ModelInfo[]> {
  const res = await request(baseUrl, "/models", apiKey, { method: "GET", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] };
  const models = (body.data ?? [])
    .filter((m): m is { id: string } => typeof m.id === "string" && m.id.length > 0 && m.id.length <= 200)
    .map((m) => ({ id: m.id, name: m.id, contextWindow: null, maxOutput: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!models.length) throw new DirectError("服務沒有回傳任何模型（Ollama 請先用 ollama pull 下載模型）");
  return models;
}

export interface DirectChatOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  signal: AbortSignal;
}

/** 以 Chat Completions 串流回答；逐段回傳文字，最後回傳結束原因 */
export async function* streamChatDirect(o: DirectChatOptions): AsyncGenerator<{ text?: string; finish?: string | null }> {
  const res = await request(o.baseUrl, "/chat/completions", o.apiKey ?? "", {
    method: "POST",
    signal: o.signal,
    body: JSON.stringify({
      model: o.model,
      stream: true,
      max_tokens: o.maxTokens,
      messages: [{ role: "system", content: o.system }, ...o.messages],
    }),
  });
  if (!res.body) throw new DirectError("服務沒有回傳內容");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finish: string | null = null;
  try {
    while (true) {
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
        if (!data) continue;
        if (data === "[DONE]") {
          yield { finish };
          return;
        }
        let j: { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; error?: { message?: string } | string };
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.error) throw new DirectError(typeof j.error === "string" ? j.error : j.error.message || "模型回應錯誤");
        const choice = j.choices?.[0];
        if (choice?.delta?.content) yield { text: choice.delta.content };
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
    }
  } finally {
    reader.releaseLock();
  }
  yield { finish };
}
