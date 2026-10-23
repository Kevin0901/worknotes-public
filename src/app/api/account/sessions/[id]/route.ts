import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { HttpError, isUuid, json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { revokeSession } from "@/lib/sessions";

type Ctx = { params: Promise<{ id: string }> };

/** 登出自己的某一個裝置 */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiUser();
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await revokeSession(viewer.user.id, id))) throw new HttpError(404, "找不到這個登入裝置");
  await logEvent({ event: "session_revoke", path: "/account", method: "DELETE", detail: id === viewer.session.id ? "目前裝置" : id }, viewer);
  return json({ ok: true, current: id === viewer.session.id });
});
