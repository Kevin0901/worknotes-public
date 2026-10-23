import "server-only";
import { db } from "./db";
import { HttpError } from "./http";
import type { GuideMeta, Visibility } from "./types";
import type { Workspace } from "./workspace";

/** 教學頁的內容在程式中，所以可見度只有「僅自己可見」與「他人可看」兩種 */
export const GUIDE_VISIBILITIES: Visibility[] = ["private", "read"];

/** 取得目前使用者看得到的教學頁；看不到就當作不存在（404），不透露它的存在 */
export function requireGuide(ws: Workspace, slug: string): GuideMeta {
  const guide = ws.guide(slug);
  if (!guide) throw new HttpError(404, "找不到這個教學頁");
  return guide;
}

/** 變更教學頁的可見度：只有擁有者或管理員可以（與筆記、分類的規則相同） */
export async function updateGuideVisibility(ws: Workspace, slug: string, visibility: Visibility): Promise<void> {
  const guide = requireGuide(ws, slug);
  if (!guide.canManage) throw new HttpError(403, "只有擁有者或管理員可以變更這個教學頁的權限");
  if (!GUIDE_VISIBILITIES.includes(visibility)) throw new HttpError(400, "教學頁只能設定為「僅自己可見」或「他人可看」");
  const sql = await db();
  await sql`
    UPDATE guide_pages SET visibility = ${visibility}, updated_by = ${ws.viewer.actor}, updated_at = now()
    WHERE slug = ${slug}`;
}
