import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { requireGuide, updateGuideVisibility } from "@/lib/guides";
import { HttpError, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { visibilityValue } from "@/lib/validate";
import { loadWorkspace } from "@/lib/workspace";

type Ctx = { params: Promise<{ slug: string }> };

/** 變更教學頁的可見度（只有擁有者或管理員） */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const { slug } = await ctx.params;
  const body = await readJson(req);
  const visibility = visibilityValue(body.visibility);
  if (!visibility) throw new HttpError(400, "缺少欄位：visibility");
  await updateGuideVisibility(ws, slug, visibility);
  const guide = requireGuide(ws, slug);
  await logEvent({ event: "guide_share", path: guide.href, method: "PATCH", detail: `${guide.title} → ${visibility}` }, viewer);
  return json({ ok: true });
});
