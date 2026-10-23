import type { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent, purgeLogs } from "@/lib/logs";

/** 清除 N 天以前的訪問紀錄（N=0 代表全部清除） */
export const DELETE = route(async (req: NextRequest) => {
  const viewer = await requireApiAdmin();
  const body = await readJson(req);
  const days = Number(body.olderThanDays);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new HttpError(400, "天數格式錯誤");
  const count = await purgeLogs(days);
  await logEvent({
    event: "logs_purge", path: "/admin/logs", method: "DELETE", detail: `${days} 天前，共 ${count} 筆`,
    actor: `admin:${viewer.admin!.username}`, actorType: "admin",
  }, viewer);
  return json({ ok: true, count });
});
