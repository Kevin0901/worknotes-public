import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { adminUsername, hasDatabase } from "./env";
import { HttpError } from "./http";
import { currentAdminPasswordHash } from "./admin";
import { passwordFingerprint } from "./password";
import { ADMIN_COOKIE, USER_COOKIE, verifyToken, type AdminToken, type UserToken } from "./session";
import { getSettings } from "./settings";
import { getSessionUser, touchSession } from "./sessions";
import type { AppUser, Settings, UserSession, ViewerInfo } from "./types";

export interface Viewer {
  user: AppUser | null;
  /** Google 使用者目前的登入工作階段 */
  session: UserSession | null;
  admin: { username: string } | null;
  settings: Settings;
  canView: boolean;
  canEdit: boolean;
  /** 寫入紀錄用的身分（email 或 admin:帳號） */
  actor: string | null;
  actorType: "user" | "admin" | "anonymous";
}

async function adminFromToken(token: string | undefined): Promise<{ username: string } | null> {
  const payload = await verifyToken<AdminToken>(token, "admin");
  if (!payload || payload.sub !== adminUsername()) return null;
  const hash = await currentAdminPasswordHash();
  if (!hash || passwordFingerprint(hash) !== payload.pv) return null;
  return { username: payload.sub };
}

/** 取得目前訪客身分（每個請求只計算一次） */
export const getViewer = cache(async (): Promise<Viewer> => {
  const jar = await cookies();
  const settings = await getSettings();

  let user: AppUser | null = null;
  let session: UserSession | null = null;
  const userToken = await verifyToken<UserToken>(jar.get(USER_COOKIE)?.value, "user");
  // 舊版 Cookie 沒有 sid（無法撤銷），視為未登入，請使用者重新登入一次
  if (userToken?.sid && hasDatabase()) {
    try {
      const found = await getSessionUser(userToken.sid, userToken.sub);
      if (found) {
        user = found.user;
        session = found.session;
        const sid = found.session.id;
        after(() => touchSession(sid).catch(() => {}));
      }
    } catch (err) {
      console.error("[auth] 讀取使用者失敗", err);
    }
  }

  const admin = await adminFromToken(jar.get(ADMIN_COOKIE)?.value);

  const loggedIn = !!user || !!admin;
  return {
    user,
    session,
    admin,
    settings,
    canView: loggedIn || !settings.requireLogin,
    canEdit: !!admin || user?.role === "editor",
    actor: user ? user.email : admin ? `admin:${admin.username}` : null,
    actorType: user ? "user" : admin ? "admin" : "anonymous",
  };
});

export function viewerInfo(v: Viewer): ViewerInfo {
  if (v.user) {
    return {
      kind: "user",
      name: v.user.name || v.user.email,
      email: v.user.email,
      picture: v.user.picture,
      isAdmin: !!v.admin,
      canEdit: v.canEdit,
      sessionMethod: v.session?.method ?? null,
      sessionExpiresAt: v.session?.expiresAt ?? null,
    };
  }
  const base = { email: null, picture: null, sessionMethod: null, sessionExpiresAt: null };
  if (v.admin) {
    return { ...base, kind: "admin", name: `管理員 ${v.admin.username}`, isAdmin: true, canEdit: true };
  }
  return { ...base, kind: "anonymous", name: "訪客", isAdmin: false, canEdit: false };
}

/** 頁面用：沒有查看權限就導向登入頁 */
export async function requirePageViewer(currentPath: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.canView) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  return viewer;
}

/** 後台頁面用：未登入管理員就導向後台登入頁 */
export async function requireAdminPage(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.admin) redirect("/admin/login");
  return viewer;
}

/** API 用 */
export async function requireApiViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.canView) throw new HttpError(401, "請先登入");
  return viewer;
}

export async function requireApiEditor(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.user && !viewer.admin) throw new HttpError(401, "請先登入");
  if (!viewer.canEdit) throw new HttpError(403, "你的帳號只有檢視權限");
  return viewer;
}

/** API 用：必須是以 Google 帳號登入的使用者（例如核准電腦登入、管理自己的登入裝置） */
export async function requireApiUser(): Promise<Viewer & { user: AppUser; session: UserSession }> {
  const viewer = await getViewer();
  if (!viewer.user || !viewer.session) throw new HttpError(401, "請先以 Google 帳號登入");
  return viewer as Viewer & { user: AppUser; session: UserSession };
}

export async function requireApiAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.admin) throw new HttpError(401, "請先登入後台");
  return viewer;
}
