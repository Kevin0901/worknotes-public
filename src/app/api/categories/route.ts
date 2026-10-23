import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { createCategory } from "@/lib/notes";
import { iconValue, optionalUuid, visibilityValue } from "@/lib/validate";
import { loadWorkspace, resolveSpace } from "@/lib/workspace";

export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const body = await readJson(req);
  const category = await createCategory(ws, {
    name: str(body.name, "分類名稱", { required: true, max: 80 })!,
    icon: iconValue(body.icon) ?? null,
    parentId: optionalUuid(body.parentId, "上層分類") ?? null,
    spaceUserId: resolveSpace(ws, body.space),
    visibility: visibilityValue(body.visibility),
  });
  await logEvent({ event: "category_create", path: `/c/${category.id}`, method: "POST", detail: category.name }, viewer);
  return json({ category }, 201);
});
