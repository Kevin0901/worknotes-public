import "server-only";
// 使用者 API 金鑰的加密（AES-256-GCM）
//
// - 主金鑰只在伺服器：優先使用環境變數 AI_KEY_ENCRYPTION_KEY（32 bytes，base64 或 hex）；
//   未設定時以 HKDF-SHA256 從 AUTH_SECRET 衍生一把「只用於加密 API 金鑰」的子金鑰（與簽署 Cookie 的用途分開）。
// - 每筆密文使用隨機 12 bytes IV；AAD 綁定「使用者 id、供應商、金鑰 id」，密文被搬到別的帳號或別筆資料時會解密失敗。
// - 密文格式：<版本>.<iv>.<tag>.<ciphertext>（base64url），版本用來分辨主金鑰來源，日後可輪替。
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { authSecret } from "../env";

type Version = "k1" | "a1";

function dedicatedKey(): Buffer | null {
  const raw = process.env.AI_KEY_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("AI_KEY_ENCRYPTION_KEY 必須是 32 bytes（base64 或 64 個 16 進位字元）");
  return buf;
}

function derivedKey(): Buffer | null {
  const secret = authSecret();
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, "worknotes:ai-credentials", "ai-api-key-encryption:v1", 32));
}

function keyFor(version: Version): Buffer | null {
  return version === "k1" ? dedicatedKey() : derivedKey();
}

/** 目前用來加密新資料的主金鑰版本；兩者都沒有時不能儲存金鑰 */
function currentVersion(): Version | null {
  if (dedicatedKey()) return "k1";
  if (derivedKey()) return "a1";
  return null;
}

export function canEncrypt(): boolean {
  try {
    return currentVersion() !== null;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, aad: string): string {
  const version = currentVersion();
  const key = version && keyFor(version);
  if (!version || !key) throw new Error("伺服器未設定加密金鑰，無法儲存 API 金鑰");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** 解密失敗（主金鑰已更換、資料被竄改或 AAD 不符）一律回傳 null，不拋出細節 */
export function decryptSecret(blob: string, aad: string): string | null {
  try {
    const [version, iv, tag, ct] = blob.split(".");
    // 密文可以是空字串（例如沒有金鑰的本機端點）
    if ((version !== "k1" && version !== "a1") || !iv || !tag || ct === undefined) return null;
    const key = keyFor(version);
    if (!key) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** 自訂端點的網址也納入 AAD：資料庫中的網址被改成別的伺服器時，金鑰會解密失敗，不會被送到那裡 */
export const credentialAad = (userId: string, provider: string, id: string, baseUrl?: string | null) =>
  `worknotes-ai-credential:v1:${userId}:${provider}:${id}${baseUrl ? `:${baseUrl}` : ""}`;

/** 只顯示前 4 碼與後 4 碼，用來辨識是哪一把金鑰 */
export function keyHint(key: string): string {
  if (key.length <= 12) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** 從錯誤訊息中移除金鑰或任何疑似金鑰的字串，避免供應商把金鑰回傳在錯誤內容裡 */
export function redactSecrets(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join("[已遮蔽]");
  }
  return out
    .replace(/\b(sk-[A-Za-z0-9_-]{6,}|sk-ant-[A-Za-z0-9_-]{6,}|sk-or-[A-Za-z0-9_-]{6,}|gsk_[A-Za-z0-9]{6,}|nvapi-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{10,})/g, "[已遮蔽]")
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]?\s*[A-Za-z0-9_\-.]{12,}/gi, "$1 [已遮蔽]");
}
