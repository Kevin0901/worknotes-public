import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "./db";
import { requestInfo } from "./request-info";
import type { AppUser, LoginRequestInfo, UserSession } from "./types";

// ───────────── 登入工作階段（可撤銷） ─────────────

interface SessionRow {
  id: string;
  user_id: string;
  method: string;
  created_at: Date;
  expires_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  user_agent: string | null;
}

const toSession = (r: SessionRow): UserSession => ({
  id: r.id,
  method: r.method,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
  lastSeenAt: r.last_seen_at.toISOString(),
  ip: r.ip,
  country: r.country,
  city: r.city,
  userAgent: r.user_agent,
});

export async function createSession(userId: string, method: "google" | "qr", seconds: number, headers: Headers): Promise<string> {
  const sql = await db();
  const info = requestInfo(headers);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO user_sessions (user_id, method, expires_at, ip, country, city, user_agent)
    VALUES (${userId}, ${method}, now() + make_interval(secs => ${seconds}), ${info.ip}, ${info.country}, ${info.city}, ${info.userAgent})
    RETURNING id`;
  // 順便清掉早已失效的舊資料
  if (Math.random() < 0.1) {
    await sql`DELETE FROM user_sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'`;
    await sql`DELETE FROM login_requests WHERE created_at < now() - interval '1 day'`;
  }
  return row.id;
}

/** 驗證工作階段：未撤銷、未過期，且使用者仍為已核准狀態 */
export async function getSessionUser(sid: string, userId: string): Promise<{ user: AppUser; session: UserSession } | null> {
  const sql = await db();
  const rows = await sql<(SessionRow & { u_email: string; u_name: string | null; u_picture: string | null; u_status: AppUser["status"]; u_role: AppUser["role"]; u_created_at: Date; u_approved_at: Date | null; u_last_login_at: Date | null })[]>`
    SELECT s.*, u.email AS u_email, u.name AS u_name, u.picture AS u_picture, u.status AS u_status, u.role AS u_role,
           u.created_at AS u_created_at, u.approved_at AS u_approved_at, u.last_login_at AS u_last_login_at
    FROM user_sessions s JOIN app_users u ON u.id = s.user_id
    WHERE s.id = ${sid} AND s.user_id = ${userId} AND s.revoked_at IS NULL AND s.expires_at > now()`;
  const r = rows[0];
  if (!r || r.u_status !== "approved") return null;
  return {
    session: toSession(r),
    user: {
      id: r.user_id,
      email: r.u_email,
      name: r.u_name,
      picture: r.u_picture,
      status: r.u_status,
      role: r.u_role,
      createdAt: r.u_created_at.toISOString(),
      approvedAt: r.u_approved_at?.toISOString() ?? null,
      lastLoginAt: r.u_last_login_at?.toISOString() ?? null,
    },
  };
}

/** 更新最後使用時間（5 分鐘內不重複寫入） */
export async function touchSession(sid: string): Promise<void> {
  const sql = await db();
  await sql`UPDATE user_sessions SET last_seen_at = now() WHERE id = ${sid} AND last_seen_at < now() - interval '5 minutes'`;
}

export async function listActiveSessions(userId: string): Promise<UserSession[]> {
  const sql = await db();
  const rows = await sql<SessionRow[]>`
    SELECT * FROM user_sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()
    ORDER BY last_seen_at DESC`;
  return rows.map(toSession);
}

export async function revokeSession(userId: string, sid: string): Promise<boolean> {
  const sql = await db();
  const res = await sql`UPDATE user_sessions SET revoked_at = now() WHERE id = ${sid} AND user_id = ${userId} AND revoked_at IS NULL`;
  return res.count > 0;
}

export async function revokeOtherSessions(userId: string, keepSid: string): Promise<number> {
  const sql = await db();
  const res = await sql`
    UPDATE user_sessions SET revoked_at = now()
    WHERE user_id = ${userId} AND id <> ${keepSid} AND revoked_at IS NULL AND expires_at > now()`;
  return res.count;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const sql = await db();
  const res = await sql`
    UPDATE user_sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()`;
  return res.count;
}

// ───────────── 手機掃碼登入請求 ─────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉容易混淆的 I、O、0、1

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("base64url");

interface RequestRow {
  id: string;
  code: string;
  secret_hash: string;
  status: LoginRequestInfo["status"];
  created_at: Date;
  expires_at: Date;
  user_id: string | null;
  session_hours: number | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  user_agent: string | null;
}

const toRequest = (r: RequestRow): LoginRequestInfo => ({
  code: formatCode(r.code),
  status: r.status === "pending" && r.expires_at.getTime() <= Date.now() ? "expired" : r.status,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
  ip: r.ip,
  country: r.country,
  city: r.city,
  userAgent: r.user_agent,
});

export async function createLoginRequest(headers: Headers, seconds: number): Promise<{ id: string; code: string; secret: string; expiresAt: string }> {
  const sql = await db();
  const info = requestInfo(headers);
  const secret = randomBytes(32).toString("base64url");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const rows = await sql<{ id: string; expires_at: Date }[]>`
      INSERT INTO login_requests (code, secret_hash, expires_at, ip, country, city, user_agent)
      VALUES (${code}, ${hashSecret(secret)}, now() + make_interval(secs => ${seconds}), ${info.ip}, ${info.country}, ${info.city}, ${info.userAgent})
      ON CONFLICT (code) DO NOTHING
      RETURNING id, expires_at`;
    if (rows[0]) return { id: rows[0].id, code: formatCode(code), secret, expiresAt: rows[0].expires_at.toISOString() };
  }
  throw new Error("無法產生登入代碼，請再試一次");
}

export async function getLoginRequestByCode(code: string): Promise<LoginRequestInfo | null> {
  const sql = await db();
  const rows = await sql<RequestRow[]>`SELECT * FROM login_requests WHERE code = ${normalizeCode(code)}`;
  return rows[0] ? toRequest(rows[0]) : null;
}

/** 手機端核准或拒絕（只能處理尚未過期、尚未處理的請求） */
export async function decideLoginRequest(
  code: string,
  userId: string,
  decision: "approved" | "denied",
  sessionHours: number,
): Promise<LoginRequestInfo | null> {
  const sql = await db();
  const rows = await sql<RequestRow[]>`
    UPDATE login_requests SET status = ${decision}, user_id = ${userId}, session_hours = ${sessionHours}, decided_at = now()
    WHERE code = ${normalizeCode(code)} AND status = 'pending' AND expires_at > now()
    RETURNING *`;
  return rows[0] ? toRequest(rows[0]) : null;
}

/** 電腦端輪詢：檢查狀態；已核准時改為 consumed（只能使用一次） */
export async function pollLoginRequest(
  id: string,
  secret: string,
): Promise<{ status: LoginRequestInfo["status"]; userId?: string; sessionHours?: number }> {
  const sql = await db();
  const consumed = await sql<{ user_id: string; session_hours: number }[]>`
    UPDATE login_requests SET status = 'consumed'
    WHERE id = ${id} AND secret_hash = ${hashSecret(secret)} AND status = 'approved'
    RETURNING user_id, session_hours`;
  if (consumed[0]) return { status: "approved", userId: consumed[0].user_id, sessionHours: consumed[0].session_hours };
  const rows = await sql<RequestRow[]>`SELECT * FROM login_requests WHERE id = ${id} AND secret_hash = ${hashSecret(secret)}`;
  if (!rows[0]) return { status: "expired" };
  return { status: toRequest(rows[0]).status };
}
