import type { NextRequest } from "next/server";
import { json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { QR_COOKIE, USER_COOKIE, cookieOptions, signToken, verifyToken, type QrToken } from "@/lib/session";
import { createSession, pollLoginRequest } from "@/lib/sessions";
import { getUserById } from "@/lib/users";

/** 電腦端：每隔幾秒詢問一次手機是否已核准；核准後在這個瀏覽器建立登入 Cookie */
export const GET = route(async (req: NextRequest) => {
  const token = await verifyToken<QrToken>(req.cookies.get(QR_COOKIE)?.value, "qr");
  if (!token) return json({ status: "expired" });

  const result = await pollLoginRequest(token.rid, token.secret);
  if (result.status !== "approved" || !result.userId) return json({ status: result.status });

  const user = await getUserById(result.userId);
  if (!user || user.status !== "approved") return json({ status: "denied" });

  const seconds = Math.min(Math.max(result.sessionHours ?? 8, 1), 72) * 3600;
  const sid = await createSession(user.id, "qr", seconds, req.headers);
  const session = await signToken({ typ: "user", sub: user.id, email: user.email, sid }, seconds);
  await logEvent({ event: "login_qr_success", path: "/login/qr", actor: user.email, actorType: "user", detail: `${seconds / 3600} 小時` });

  const res = json({ status: "approved", next: token.next || "/" });
  res.cookies.delete(QR_COOKIE);
  res.cookies.set(USER_COOKIE, session, cookieOptions(seconds));
  return res;
});
