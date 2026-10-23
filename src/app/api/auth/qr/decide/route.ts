import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { SESSION_HOUR_OPTIONS } from "@/lib/constants";
import { decideLoginRequest } from "@/lib/sessions";

/** 手機端：核准或拒絕電腦的登入請求（只能替自己的帳號核准） */
export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiUser();
  const body = await readJson(req, 2_000);
  const code = typeof body.code === "string" ? body.code : "";
  const decision = body.decision === "approve" ? "approved" : body.decision === "deny" ? "denied" : null;
  if (!code || !decision) throw new HttpError(400, "資料格式錯誤");
  const hours = Number(body.hours);
  if (decision === "approved" && !(SESSION_HOUR_OPTIONS as readonly number[]).includes(hours)) throw new HttpError(400, "登入時間選項錯誤");

  const result = await decideLoginRequest(code, viewer.user.id, decision, decision === "approved" ? hours : 0);
  if (!result) throw new HttpError(410, "這個登入代碼已過期或已處理，請在電腦上重新產生");
  await logEvent({
    event: decision === "approved" ? "qr_login_approve" : "qr_login_deny",
    path: `/qr/${result.code}`, method: "POST",
    detail: `${result.ip ?? "?"} ${[result.country, result.city].filter(Boolean).join(" ")}${decision === "approved" ? `，${hours} 小時` : ""}`,
  }, viewer);
  return json({ ok: true, status: result.status });
});
