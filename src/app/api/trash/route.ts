import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { emptyTrash } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

export const DELETE = route(async (_req: NextRequest) => {
  const viewer = await requireApiEditor();
  const count = await emptyTrash(await loadWorkspace());
  await logEvent({ event: "trash_empty", path: "/trash", method: "DELETE", detail: `${count} 篇` }, viewer);
  return json({ ok: true, count });
});
