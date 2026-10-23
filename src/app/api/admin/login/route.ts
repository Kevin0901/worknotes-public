import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { adminUsername } from "@/lib/env";
import { currentAdminPasswordHash } from "@/lib/admin";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent, recentEventCount } from "@/lib/logs";
import { passwordFingerprint, safeEqual, verifyPassword } from "@/lib/password";
import { requestInfo } from "@/lib/request-info";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, cookieOptions, signToken } from "@/lib/session";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

export const POST = route(async (req: NextRequest) => {
  const body = await readJson(req, 10_000);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const { ip } = requestInfo(await headers());
  const logBase = { path: "/admin/login", method: "POST", actor: username ? `admin:${username}`.slice(0, 80) : null };

  if ((await recentEventCount("admin_login_failed", ip, WINDOW_MINUTES)) >= MAX_FAILURES) {
    await logEvent({ ...logBase, event: "admin_login_blocked", actorType: "anonymous" });
    throw new HttpError(429, `登入失敗次數過多，請 ${WINDOW_MINUTES} 分鐘後再試`);
  }

  const hash = await currentAdminPasswordHash();
  if (!hash) throw new HttpError(503, "尚未設定管理員密碼（ADMIN_PASSWORD_HASH）");

  const userOk = safeEqual(username, adminUsername());
  const passOk = await verifyPassword(password, hash);
  if (!userOk || !passOk) {
    await logEvent({ ...logBase, event: "admin_login_failed", actorType: "anonymous" }, undefined, { immediate: true });
    await new Promise((r) => setTimeout(r, 600));
    throw new HttpError(401, "帳號或密碼錯誤");
  }

  const token = await signToken({ typ: "admin", sub: adminUsername(), pv: passwordFingerprint(hash) }, ADMIN_SESSION_SECONDS);
  await logEvent({ ...logBase, event: "admin_login_success", actor: `admin:${adminUsername()}`, actorType: "admin" });
  const res = json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_SESSION_SECONDS));
  return res;
});
