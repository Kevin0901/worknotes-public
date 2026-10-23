import "server-only";
// 使用者自訂的 AI 端點（OpenAI 相容 API，例如自架的 vLLM、經 HTTPS 公開的 Ollama）
//
// 伺服器代連時的 SSRF 防護：
// - 只接受 https://，不可帶帳密、查詢字串或 #。
// - 主機名稱解析出的「每一個」IP 都必須是公開位址；檢查發生在實際建立連線的 DNS 查詢（lookup）中，
//   不會被 DNS rebinding（先回公開 IP、連線時改回內網 IP）繞過。IP 直接寫在網址時另外檢查。
// - 不跟隨轉址（node:https 本身不會自動轉址）；有逾時與回應大小上限。
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { HttpError } from "../http";
import { isLocalBaseUrl, LOCAL_HOSTS } from "./catalog";

/** IPv4 私有、保留、迴路、連結本機、CGNAT、多播等位址都不是公開位址 */
function isPublicIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // 連結本機（含雲端中繼資料 169.254.169.254）
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // 多播與保留
  return true;
}

function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  // 結尾是 IPv4（例如 ::ffff:1.2.3.4）
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  if (s.split("::").length > 2) return null;
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const groups = [...h, ...Array(fill).fill("0"), ...t].map((g) => Number.parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isPublicIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // IPv4 對應（::ffff:a.b.c.d）與 NAT64（64:ff9b::/96）：檢查內嵌的 IPv4
  const embedded = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicIPv4(embedded);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicIPv4(embedded);
  if (g.slice(0, 6).every((x) => x === 0)) return false; // 已棄用的 IPv4 相容位址
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 唯一本地
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 連結本機
  if ((g[0] & 0xff00) === 0xff00) return false; // 多播
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // 文件用
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // 丟棄用
  if (g[0] === 0x2002) return isPublicIPv4(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPublicIPv4(ip);
  if (kind === 6) return isPublicIPv6(ip);
  return false;
}

/** 明顯是內部網路的主機名稱，直接拒絕（解析後的 IP 仍會再檢查一次） */
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa", ".corp", ".intranet"];

export type EndpointMode = "server" | "direct";

/**
 * 檢查並正規化使用者輸入的 API 網址（去掉結尾斜線）。
 * - server：伺服器代連，只接受公開的 https 網址
 * - direct：瀏覽器直連，只接受本機（localhost／127.0.0.1／[::1]）
 */
export function normalizeBaseUrl(value: unknown, mode: EndpointMode): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "請輸入 API 網址");
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    throw new HttpError(400, "API 網址格式不正確（例如 https://api.example.com/v1）");
  }
  if (u.username || u.password) throw new HttpError(400, "API 網址不可包含帳號密碼，金鑰請填在「API 金鑰」欄位");
  if (u.search || u.hash) throw new HttpError(400, "API 網址不可包含 ? 或 # 之後的參數");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (mode === "direct") {
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, "只支援 http 或 https");
    if (!LOCAL_HOSTS.includes(host)) throw new HttpError(400, "瀏覽器直連只支援這台電腦上的服務（localhost 或 127.0.0.1）");
  } else {
    if (u.protocol !== "https:") throw new HttpError(400, "由本站伺服器連線時只支援 https:// 網址（避免金鑰以明文傳送）");
    const singleLabel = !host.includes(".") && !net.isIP(host);
    if (LOCAL_HOSTS.includes(host) || singleLabel || INTERNAL_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) {
      throw new HttpError(400, "本站伺服器在雲端，連不到你的電腦或內部網路；本機的 Ollama、LM Studio 請改用「瀏覽器直連」");
    }
    if (net.isIP(host) && !isPublicAddress(host)) throw new HttpError(400, "不允許連線到內部網路或保留位址");
  }
  const url = `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, "");
  if (url.length > 300) throw new HttpError(400, "API 網址太長");
  return url;
}

export { isLocalBaseUrl };

class BlockedAddressError extends Error {
  code = "EBLOCKED";
}

/** 建立連線前的 DNS 查詢：所有解析結果都必須是公開位址 */
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
): void {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new BlockedAddressError(`${hostname} 解析到內部或保留位址，已拒絕連線`), "");
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** 等待回應標頭的逾時（毫秒） */
  timeoutMs?: number;
  /** 回應內容上限（bytes） */
  maxBytes?: number;
}

/**
 * 連到使用者自訂端點用的 fetch（只用於伺服器代連）：解析位址檢查、不轉址、有大小上限。
 * 回傳標準 Response，呼叫端可以沿用一般 fetch 的處理方式。
 */
export function safeFetch(url: string, init: SafeFetchInit = {}): Promise<Response> {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (u.protocol !== "https:") return Promise.reject(new BlockedAddressError("只允許 https"));
  if (net.isIP(host) && !isPublicAddress(host)) return Promise.reject(new BlockedAddressError("不允許連線到內部網路或保留位址"));
  const maxBytes = init.maxBytes ?? 20_000_000;

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:",
        hostname: host,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: init.method ?? "GET",
        headers: { "User-Agent": "WorkNotes-AI/1.0", ...init.headers },
        lookup: safeLookup as unknown as http.RequestOptions["lookup"],
        signal: init.signal,
        timeout: init.timeoutMs ?? 30_000,
      },
      (res) => {
        req.setTimeout(0);
        const status = res.statusCode ?? 502;
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
          else if (v !== undefined) headers.set(k, String(v));
        }
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) res.destroy(new Error("回應內容超過上限"));
        });
        const noBody = status === 204 || status === 205 || status === 304 || status < 200;
        resolve(new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status: Math.max(200, Math.min(status, 599)), headers }));
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("連線逾時"), { name: "TimeoutError" })));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

export function isBlockedError(err: unknown): err is Error {
  return err instanceof BlockedAddressError || (err as { code?: string })?.code === "EBLOCKED";
}
