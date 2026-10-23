import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { createNote } from "@/lib/notes";
import { iconValue, optionalUuid, tagsValue, visibilityValue } from "@/lib/validate";
import { loadWorkspace, resolveSpace } from "@/lib/workspace";

export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const body = await readJson(req, 2_000_000);
  const note = await createNote(ws, {
    categoryId: optionalUuid(body.categoryId, "分類") ?? null,
    spaceUserId: resolveSpace(ws, body.space),
    title: str(body.title, "標題", { max: 200 }) || "未命名筆記",
    icon: iconValue(body.icon) ?? null,
    content: str(body.content, "內容", { max: 500_000, trim: false }) ?? "",
    tags: tagsValue(body.tags) ?? [],
    visibility: visibilityValue(body.visibility),
  });
  await logEvent({ event: "note_create", path: `/n/${note.id}`, method: "POST", detail: note.title }, viewer);
  return json({ note }, 201);
});
