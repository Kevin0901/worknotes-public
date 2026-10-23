import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { authSecret } from "./env";

export const USER_COOKIE = "wn_session";
export const ADMIN_COOKIE = "wn_admin";
export const OAUTH_COOKIE = "wn_oauth";
export const QR_COOKIE = "wn_qr";

export const USER_SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 天
export const ADMIN_SESSION_SECONDS = 60 * 60 * 12; // 12 小時
export const OAUTH_STATE_SECONDS = 60 * 10; // 10 分鐘
export const QR_REQUEST_SECONDS = 60 * 3; // 掃碼登入請求的有效時間

export interface UserToken extends JWTPayload {
  typ: "user";
  sub: string;
  email: string;
  sid: string; // user_sessions.id，可在「登入裝置」頁面撤銷
}

export interface AdminToken extends JWTPayload {
  typ: "admin";
  sub: string;
  pv: string; // 密碼指紋
}

export interface OAuthToken extends JWTPayload {
  typ: "oauth";
  state: string;
  verifier: string;
  next: string;
}

/** 電腦端等待手機核准時，綁定在該瀏覽器的憑證 */
export interface QrToken extends JWTPayload {
  typ: "qr";
  rid: string;
  secret: string;
  next: string;
}

type AnyToken = UserToken | AdminToken | OAuthToken | QrToken;

function key(): Uint8Array | null {
  const secret = authSecret();
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function signToken(payload: Omit<AnyToken, "iat" | "exp">, maxAgeSeconds: number): Promise<string> {
  const k = key();
  if (!k) throw new Error("AUTH_SECRET 未設定");
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(k);
}

export async function verifyToken<T extends AnyToken>(token: string | undefined, typ: T["typ"]): Promise<T | null> {
  const k = key();
  if (!token || !k) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    return payload.typ === typ ? (payload as T) : null;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
