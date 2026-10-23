// 產生後台管理員密碼雜湊：npm run hash-password -- '你的密碼'
// 輸出格式與 src/lib/password.ts 相同：scrypt:N:r:p:salt:hash（base64url）
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("用法：npm run hash-password -- '你的密碼'");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });
console.log(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`);
