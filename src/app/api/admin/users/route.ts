import type { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { addApprovedUser, listUsers } from "@/lib/users";

const adminActor = (username: string) => ({ actor: `admin:${username}`, actorType: "admin" as const });

export const GET = route(async () => {
  await requireApiAdmin();
  return json({ users: await listUsers() });
});

/** 預先加入並核准一個 Google 帳號 */
export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiAdmin();
  const body = await readJson(req);
  const email = str(body.email, "Email", { required: true, max: 254 })!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Email 格式不正確");
  const role = body.role === "viewer" ? "viewer" : "editor";
  const user = await addApprovedUser(email, role);
  await logEvent({ event: "user_add", path: "/admin/users", method: "POST", detail: `${email}（${role}）`, ...adminActor(viewer.admin!.username) }, viewer);
  return json({ user }, 201);
});
