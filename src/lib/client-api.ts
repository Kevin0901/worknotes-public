// 前端呼叫 API 的共用函式

export async function api<T = Record<string, unknown>>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `請求失敗（HTTP ${res.status}）`);
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
