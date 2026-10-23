// 端對端測試共用工具：讀取 .env.local、連線本機資料庫、產生測試帳號的登入 Cookie、呼叫 API
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { SignJWT } from "jose";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** 測試用帳號（只會建立在本機資料庫） */
export const TEST_USERS = {
  A: { email: "e2e-a@example.test", name: "測試A", role: "editor" },
  B: { email: "e2e-b@example.test", name: "測試B", role: "editor" },
  V: { email: "e2e-viewer@example.test", name: "測試檢視者", role: "viewer" },
};

export function loadEnv() {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) throw new Error("找不到 .env.local（請在專案根目錄執行，並參考 .env.example 建立）");
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** 只允許連到本機資料庫，避免不小心在正式環境建立測試資料 */
export function localDb() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (!local && process.env.E2E_ALLOW_REMOTE !== "1") {
    throw new Error(`DATABASE_URL 指向 ${url.hostname}，不是本機資料庫，已停止（確定要執行請設定 E2E_ALLOW_REMOTE=1）`);
  }
  return postgres(process.env.DATABASE_URL, { ssl: local ? false : "require", onnotice: () => {} });
}

export async function ensureTestUsers(sql) {
  for (const u of Object.values(TEST_USERS)) {
    await sql`
      INSERT INTO app_users (email, name, status, role, approved_at)
      VALUES (${u.email}, ${u.name}, 'approved', ${u.role}, now())
      ON CONFLICT (email) DO UPDATE SET status = 'approved', role = EXCLUDED.role, name = EXCLUDED.name`;
  }
  await sql`UPDATE app_users SET space_hidden = false WHERE email LIKE 'e2e-%@example.test'`;
}

/** 建立一筆登入工作階段並回傳 wn_session Cookie 值 */
export async function mintSession(sql, email) {
  const [u] = await sql`SELECT id, email FROM app_users WHERE email = ${email}`;
  if (!u) throw new Error(`找不到帳號 ${email}`);
  const [s] = await sql`
    INSERT INTO user_sessions (user_id, method, expires_at) VALUES (${u.id}, 'google', now() + interval '1 day') RETURNING id`;
  return new SignJWT({ typ: "user", sub: u.id, email: u.email, sid: s.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("86400s")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

/** 以後台帳號登入（需要 ADMIN_TEST_PASSWORD），回傳 Cookie 字串；沒有設定時回傳 null */
export async function adminCookie() {
  const password = process.env.ADMIN_TEST_PASSWORD;
  if (!password) return null;
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME || "admin", password }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("wn_admin="));
  if (!res.ok || !cookie) throw new Error(`後台登入失敗（${res.status}），請確認 ADMIN_TEST_PASSWORD`);
  return cookie;
}

export function client(cookie) {
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { cookie, origin: BASE, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* 非 JSON */
    }
    return { status: res.status, data, location: res.headers.get("location") };
  };
}

export async function page(cookie, path) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

export function checker() {
  let fails = 0;
  const expect = (name, cond, extra = "") => {
    if (cond) console.log("  ok  ", name);
    else {
      fails++;
      console.log("  FAIL", name, extra);
    }
  };
  return { expect, done: () => (console.log(fails ? `\n${fails} 項失敗` : "\n全部通過"), fails) };
}
