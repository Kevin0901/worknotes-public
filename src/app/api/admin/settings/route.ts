import type { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { updateSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";

const LABELS: Record<keyof Settings, string> = {
  siteTitle: "網站名稱",
  requireLogin: "前台需登入",
  allowRegistration: "開放申請",
  logPageViews: "記錄頁面瀏覽",
  logRetentionDays: "紀錄保留天數",
};

export const PATCH = route(async (req: NextRequest) => {
  const viewer = await requireApiAdmin();
  const body = await readJson(req);
  const patch: Partial<Settings> = {};
  if (body.siteTitle !== undefined) patch.siteTitle = str(body.siteTitle, "網站名稱", { required: true, max: 40 });
  for (const key of ["requireLogin", "allowRegistration", "logPageViews"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") throw new HttpError(400, `欄位格式錯誤：${key}`);
    patch[key] = body[key] as boolean;
  }
  if (body.logRetentionDays !== undefined) {
    const days = Number(body.logRetentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new HttpError(400, "保留天數需介於 1～3650");
    patch.logRetentionDays = days;
  }
  await updateSettings(patch);
  const detail = (Object.keys(patch) as (keyof Settings)[]).map((k) => `${LABELS[k]}=${String(patch[k])}`).join("，");
  await logEvent({
    event: "settings_update", path: "/admin/settings", method: "PATCH", detail,
    actor: `admin:${viewer.admin!.username}`, actorType: "admin",
  }, viewer);
  return json({ ok: true });
});
