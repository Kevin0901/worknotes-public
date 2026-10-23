import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { appOrigin } from "@/lib/env";
import { findNoteByTitle } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

/** [[筆記標題]] 連結：依標題找到筆記後導向，找不到則改為搜尋 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req.headers);
  const title = (req.nextUrl.searchParams.get("t") || "").trim().slice(0, 200);
  const viewer = await getViewer();
  if (!viewer.canView) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/go?t=${encodeURIComponent(title)}`)}`, origin));
  }
  if (!title) return NextResponse.redirect(new URL("/", origin));
  const id = await findNoteByTitle(await loadWorkspace(), title);
  return NextResponse.redirect(new URL(id ? `/n/${id}` : `/search?q=${encodeURIComponent(title)}`, origin));
}
