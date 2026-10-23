import { db } from "@/lib/db";
import { authSecret, googleConfig, hasDatabase } from "@/lib/env";
import { json } from "@/lib/http";

/** 系統健康檢查（不透露任何機密，只回報是否設定完成） */
export async function GET() {
  let database: "ok" | "missing" | "error" = hasDatabase() ? "ok" : "missing";
  if (database === "ok") {
    try {
      const sql = await db();
      await sql`SELECT 1`;
    } catch {
      database = "error";
    }
  }
  return json({
    database,
    googleOAuth: googleConfig() ? "ok" : "missing",
    authSecret: authSecret() ? "ok" : "missing",
  });
}
