import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { appOrigin, hasDatabase } from "@/lib/env";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent, recentEventCount } from "@/lib/logs";
import { safeNext } from "@/lib/oauth";
import { requestInfo } from "@/lib/request-info";
import { QR_COOKIE, QR_REQUEST_SECONDS, cookieOptions, signToken } from "@/lib/session";
import { createLoginRequest } from "@/lib/sessions";

/** 電腦端：建立一筆掃碼登入請求，回傳 QR Code 與配對代碼 */
export const POST = route(async (req: NextRequest) => {
  if (!hasDatabase()) throw new HttpError(503, "尚未設定資料庫");
  const body = await readJson(req, 2_000);
  const hdrs = await headers();
  const { ip } = requestInfo(hdrs);
  if ((await recentEventCount("qr_login_start", ip, 10)) >= 30) {
    throw new HttpError(429, "請求太頻繁，請稍後再試");
  }

  const request = await createLoginRequest(hdrs, QR_REQUEST_SECONDS);
  const approveUrl = `${appOrigin(req.headers)}/qr/${request.code}`;
  const qrSvg = await QRCode.toString(approveUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const token = await signToken(
    { typ: "qr", rid: request.id, secret: request.secret, next: safeNext(typeof body.next === "string" ? body.next : "/") },
    QR_REQUEST_SECONDS + 30,
  );
  await logEvent({ event: "qr_login_start", path: "/login/qr", method: "POST", detail: request.code }, undefined, { immediate: true });

  const res = json({ code: request.code, expiresAt: request.expiresAt, approveUrl, qrSvg });
  res.cookies.set(QR_COOKIE, token, cookieOptions(QR_REQUEST_SECONDS + 30));
  return res;
});
