import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { ADMIN_COOKIE } from "@/lib/session";

export const POST = route(async (_req: NextRequest) => {
  const viewer = await getViewer();
  if (viewer.admin) {
    await logEvent({
      event: "admin_logout", path: "/admin", method: "POST",
      actor: `admin:${viewer.admin.username}`, actorType: "admin",
    }, viewer);
  }
  const res = json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
});
