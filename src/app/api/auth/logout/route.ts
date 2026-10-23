import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { appOrigin } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { USER_COOKIE } from "@/lib/session";
import { revokeSession } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  const origin = appOrigin(req.headers);
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.redirect(new URL("/", origin), 303);
  }
  const viewer = await getViewer();
  if (viewer.user && viewer.session) {
    await revokeSession(viewer.user.id, viewer.session.id);
    await logEvent({ event: "logout", path: "/api/auth/logout", method: "POST", detail: viewer.session.method }, viewer);
  }
  const res = NextResponse.redirect(new URL("/login?loggedout=1", origin), 303);
  res.cookies.delete(USER_COOKIE);
  return res;
}
