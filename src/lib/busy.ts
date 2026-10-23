// 全站「等待網路」狀態：計算進行中的同源請求，讓 BusyIndicator 顯示轉圈提示。
// 以攔截 window.fetch 的方式涵蓋所有按鈕的 API 呼叫、換頁（RSC）與 router.refresh()，不必逐一修改按鈕。

export type BusyKind = "page" | "action";

export interface BusySnapshot {
  /** 進行中的請求數 */
  count: number;
  /** 有任何「處理中」（送出、儲存、刪除）就顯示處理中，否則顯示載入中 */
  kind: BusyKind | null;
  /** 這一輪等待開始的時間（毫秒），沒有請求時為 0 */
  since: number;
}

/** 加上這個標頭的請求不顯示等待提示（背景輪詢等） */
export const SILENT_HEADER = "x-wn-silent";

/** 不顯示等待提示的路徑：背景輪詢，以及有自己進度提示的 AI 串流對話 */
const SILENT_PATHS = [/^\/api\/auth\/qr\/poll$/, /^\/api\/ai\/chat(\/|$)/, /^\/api\/health$/, /^\/_next\//, /^\/__nextjs/];

/** 依請求判斷要不要顯示等待提示、顯示哪一種（純函式，有單元測試） */
export function classifyRequest(url: URL, origin: string, method: string, headers: Headers): BusyKind | null {
  if (url.origin !== origin) return null;
  if (headers.has(SILENT_HEADER)) return null;
  // 連結預先載入是背景動作，使用者沒有在等
  if (headers.has("next-router-prefetch") || headers.has("next-router-segment-prefetch")) return null;
  if (SILENT_PATHS.some((re) => re.test(url.pathname))) return null;
  if (headers.get("rsc") === "1") return "page";
  return method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD" ? "page" : "action";
}

const EMPTY: BusySnapshot = { count: 0, kind: null, since: 0 };
const active = new Map<number, BusyKind>();
const listeners = new Set<() => void>();
let snapshot: BusySnapshot = EMPTY;
let seq = 0;

function emit() {
  const kinds = [...active.values()];
  snapshot = kinds.length
    ? { count: kinds.length, kind: kinds.includes("action") ? "action" : "page", since: snapshot.since || Date.now() }
    : EMPTY;
  for (const fn of listeners) fn();
}

/** 開始一個等待中的動作；回傳結束函式（重複呼叫無害） */
export function beginBusy(kind: BusyKind): () => void {
  const id = ++seq;
  active.set(id, kind);
  emit();
  // 保險：卡住的請求最多算 90 秒，避免提示永遠不消失
  const timer = setTimeout(() => end(), 90_000);
  function end() {
    clearTimeout(timer);
    if (active.delete(id)) emit();
  }
  return end;
}

export function subscribeBusy(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBusySnapshot(): BusySnapshot {
  return snapshot;
}

export function getServerBusySnapshot(): BusySnapshot {
  return EMPTY;
}

let installed = false;

/** 攔截 window.fetch（只做一次）；回應標頭到達或失敗時結束等待 */
export function installFetchTracking(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let kind: BusyKind | null = null;
    try {
      const req = input instanceof Request ? input : null;
      const url = new URL(req ? req.url : String(input), window.location.href);
      const headers = new Headers(req?.headers);
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      kind = classifyRequest(url, window.location.origin, init?.method ?? req?.method ?? "GET", headers);
    } catch {
      kind = null;
    }
    if (!kind) return original(input, init);
    const end = beginBusy(kind);
    const p = original(input, init);
    p.then(end, end);
    return p;
  };
}
