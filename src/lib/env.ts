import "server-only";

/** 讀取資料庫連線字串（Vercel 的 Neon 整合會注入 DATABASE_URL 或 POSTGRES_URL） */
export function databaseUrl(): string {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

export function hasDatabase(): boolean {
  return databaseUrl().length > 0;
}

export function googleConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me-0123456789";

/** 簽署 Cookie 的金鑰；正式環境未設定時回傳 null（登入功能會停用） */
export function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return DEV_FALLBACK_SECRET;
  return null;
}

export function adminUsername(): string {
  return (process.env.ADMIN_USERNAME || "admin").trim();
}

export function adminPasswordHashFromEnv(): string | null {
  return process.env.ADMIN_PASSWORD_HASH?.trim() || null;
}

/** 網站對外網址：優先使用 APP_URL，其次使用請求的 Host */
export function appOrigin(headers: Headers): string {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
