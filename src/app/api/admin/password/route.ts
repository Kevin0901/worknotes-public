import type { NextRequest } from "next/server";
import { ADMIN_PASSWORD_SETTING, currentAdminPasswordHash } from "@/lib/admin";
import { requireApiAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { hashPassword, passwordFingerprint, verifyPassword } from "@/lib/password";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, cookieOptions, signToken } from "@/lib/session";
import { setRawSetting } from "@/lib/settings";

/** 變更後台密碼：新密碼雜湊存入資料庫，優先於環境變數；其他已登入的後台 Session 會失效 */
export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiAdmin();
  const body = await readJson(req, 10_000);
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  const hash = await currentAdminPasswordHash();
  if (!hash || !(await verifyPassword(current, hash))) throw new HttpError(400, "目前密碼不正確");
  if (next.length < 12) throw new HttpError(400, "新密碼至少需要 12 個字元");
  if (!/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next)) {
    throw new HttpError(400, "新密碼需包含大寫、小寫英文字母與數字");
  }
  const newHash = await hashPassword(next);
  await setRawSetting(ADMIN_PASSWORD_SETTING, newHash);
  await logEvent({
    event: "password_change", path: "/admin/settings", method: "POST",
    actor: `admin:${viewer.admin!.username}`, actorType: "admin",
  }, viewer);
  const token = await signToken({ typ: "admin", sub: viewer.admin!.username, pv: passwordFingerprint(newHash) }, ADMIN_SESSION_SECONDS);
  const res = json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_SESSION_SECONDS));
  return res;
});
