import type { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth";
import { HttpError, isUuid, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { revokeAllSessions } from "@/lib/sessions";
import { deleteUser, getUserById, updateUser } from "@/lib/users";
import type { UserRole, UserStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const STATUS_EVENT: Record<UserStatus, string> = {
  approved: "user_approve",
  rejected: "user_reject",
  disabled: "user_disable",
  pending: "user_role",
};

async function idFrom(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "找不到帳號");
  return id;
}

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiAdmin();
  const id = await idFrom(ctx);
  const body = await readJson(req);
  if (body.revokeSessions === true) {
    const target = await getUserById(id);
    if (!target) throw new HttpError(404, "找不到帳號");
    const count = await revokeAllSessions(id);
    await logEvent({
      event: "session_revoke_admin", path: "/admin/users", method: "PATCH", detail: `${target.email}（${count} 個裝置）`,
      actor: `admin:${viewer.admin!.username}`, actorType: "admin",
    }, viewer);
    return json({ ok: true, count });
  }
  const status = body.status as UserStatus | undefined;
  const role = body.role as UserRole | undefined;
  if (status !== undefined && !["pending", "approved", "rejected", "disabled"].includes(status)) {
    throw new HttpError(400, "狀態錯誤");
  }
  if (role !== undefined && !["editor", "viewer"].includes(role)) throw new HttpError(400, "權限錯誤");
  const user = await updateUser(id, { status, role });
  if (!user) throw new HttpError(404, "找不到帳號");
  await logEvent({
    event: status ? STATUS_EVENT[status] : "user_role",
    path: "/admin/users", method: "PATCH",
    detail: `${user.email} → ${status ?? ""}${status && role ? " / " : ""}${role ?? ""}`,
    actor: `admin:${viewer.admin!.username}`, actorType: "admin",
  }, viewer);
  return json({ user });
});

export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiAdmin();
  const id = await idFrom(ctx);
  const user = await deleteUser(id);
  if (!user) throw new HttpError(404, "找不到帳號");
  await logEvent({
    event: "user_delete", path: "/admin/users", method: "DELETE", detail: user.email,
    actor: `admin:${viewer.admin!.username}`, actorType: "admin",
  }, viewer);
  return json({ ok: true });
});
