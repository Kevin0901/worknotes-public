import "server-only";
import { adminPasswordHashFromEnv, hasDatabase } from "./env";
import { getRawSetting } from "./settings";

export const ADMIN_PASSWORD_SETTING = "admin_password_hash";

/** 目前生效的管理員密碼雜湊：後台變更過的密碼（存在資料庫）優先，其次為環境變數 */
export async function currentAdminPasswordHash(): Promise<string | null> {
  if (hasDatabase()) {
    try {
      const value = await getRawSetting(ADMIN_PASSWORD_SETTING);
      if (typeof value === "string" && value.startsWith("scrypt:")) return value;
    } catch (err) {
      console.error("[admin] 讀取密碼設定失敗，改用環境變數", err);
    }
  }
  return adminPasswordHashFromEnv();
}
