import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { setSpaceHidden } from "@/lib/users";

/** 我的空間：是否對其他人隱藏（管理員仍看得到） */
export const PATCH = route(async (req: NextRequest) => {
  const viewer = await requireApiUser();
  const body = await readJson(req);
  if (typeof body.hidden !== "boolean") throw new HttpError(400, "欄位格式錯誤：hidden");
  await setSpaceHidden(viewer.user.id, body.hidden);
  await logEvent(
    { event: "space_update", path: "/account", method: "PATCH", detail: body.hidden ? "隱藏我的空間" : "公開我的空間" },
    viewer,
  );
  return json({ ok: true });
});
