import "server-only";
import { db } from "./db";
import type { AppUser, UserRole, UserStatus } from "./types";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  status: UserStatus;
  role: UserRole;
  created_at: Date;
  approved_at: Date | null;
  last_login_at: Date | null;
  active_sessions?: number;
}

function toUser(r: UserRow): AppUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    picture: r.picture,
    status: r.status,
    role: r.role,
    createdAt: r.created_at.toISOString(),
    approvedAt: r.approved_at?.toISOString() ?? null,
    lastLoginAt: r.last_login_at?.toISOString() ?? null,
    ...(r.active_sessions !== undefined ? { activeSessions: r.active_sessions } : {}),
  };
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const sql = await db();
  const rows = await sql<UserRow[]>`SELECT * FROM app_users WHERE id = ${id}`;
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const sql = await db();
  const rows = await sql<UserRow[]>`SELECT * FROM app_users WHERE email = ${email.toLowerCase()}`;
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(): Promise<AppUser[]> {
  const sql = await db();
  const rows = await sql<UserRow[]>`
    SELECT u.*, (
      SELECT count(*)::int FROM user_sessions s
      WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()
    ) AS active_sessions
    FROM app_users u
    ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, u.created_at DESC`;
  return rows.map(toUser);
}

export async function createPendingUser(email: string, name: string | null, picture: string | null): Promise<AppUser> {
  const sql = await db();
  const rows = await sql<UserRow[]>`
    INSERT INTO app_users (email, name, picture, status)
    VALUES (${email.toLowerCase()}, ${name}, ${picture}, 'pending')
    ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, app_users.name),
      picture = COALESCE(EXCLUDED.picture, app_users.picture)
    RETURNING *`;
  return toUser(rows[0]);
}

/** 管理員預先加入（直接核准）的帳號 */
export async function addApprovedUser(email: string, role: UserRole): Promise<AppUser> {
  const sql = await db();
  const rows = await sql<UserRow[]>`
    INSERT INTO app_users (email, status, role, approved_at)
    VALUES (${email.toLowerCase()}, 'approved', ${role}, now())
    ON CONFLICT (email) DO UPDATE SET status = 'approved', role = EXCLUDED.role,
      approved_at = COALESCE(app_users.approved_at, now())
    RETURNING *`;
  return toUser(rows[0]);
}

export async function touchLogin(id: string, name: string | null, picture: string | null): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE app_users SET last_login_at = now(),
      name = COALESCE(${name}, name), picture = COALESCE(${picture}, picture)
    WHERE id = ${id}`;
}

export async function updateUser(id: string, patch: { status?: UserStatus; role?: UserRole }): Promise<AppUser | null> {
  const sql = await db();
  const rows = await sql<UserRow[]>`
    UPDATE app_users SET
      status = COALESCE(${patch.status ?? null}, status),
      role = COALESCE(${patch.role ?? null}, role),
      approved_at = CASE WHEN ${patch.status ?? null}::text = 'approved' AND approved_at IS NULL THEN now() ELSE approved_at END
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * 刪除帳號。個人空間的內容會移到公共區並設為「僅自己可見」（沒有擁有者時只有管理員看得到），
 * 由管理員決定要保留或刪除；公共區中此人建立的內容維持原本的可見度。
 */
export async function deleteUser(id: string): Promise<AppUser | null> {
  const sql = await db();
  return sql.begin(async (tx) => {
    await tx`UPDATE categories SET visibility = 'private' WHERE space_user_id = ${id}`;
    await tx`UPDATE notes SET visibility = 'private' WHERE space_user_id = ${id}`;
    const rows = await tx<UserRow[]>`DELETE FROM app_users WHERE id = ${id} RETURNING *`;
    return rows[0] ? toUser(rows[0]) : null;
  });
}

/** 設定自己的個人空間是否對其他人隱藏 */
export async function setSpaceHidden(id: string, hidden: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE app_users SET space_hidden = ${hidden} WHERE id = ${id}`;
}
