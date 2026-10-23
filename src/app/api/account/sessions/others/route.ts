import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { revokeOtherSessions } from "@/lib/sessions";

/** 登出目前裝置以外的所有裝置 */
export const DELETE = route(async (_req: NextRequest) => {
  const viewer = await requireApiUser();
  const count = await revokeOtherSessions(viewer.user.id, viewer.session.id);
  await logEvent({ event: "session_revoke", path: "/account", method: "DELETE", detail: `其他 ${count} 個裝置` }, viewer);
  return json({ ok: true, count });
});
