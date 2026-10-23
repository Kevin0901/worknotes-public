import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, type ScryptOptions } from "node:crypto";

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** 格式：scrypt:N:r:p:salt:hash（salt 與 hash 為 base64url） */
export async function hashPassword(password: string): Promise<string> {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltStr, hashStr] = parts;
  const N = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(hashStr, "base64url");
  if (expected.length === 0) return false;
  try {
    const actual = await scrypt(password, Buffer.from(saltStr, "base64url"), expected.length, {
      N, r, p, maxmem: 256 * N * r,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 等長比較字串，避免以回應時間推測帳號 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** 密碼雜湊的短指紋：寫進管理員 Session，密碼變更後舊 Session 自動失效 */
export function passwordFingerprint(hash: string): string {
  return createHash("sha256").update(hash).digest("base64url").slice(0, 12);
}
