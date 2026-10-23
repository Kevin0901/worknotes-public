import type { NextRequest } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { isShortMapLink } from "@/lib/map";
import { resolveShortMapLink } from "@/lib/map-resolve";

/** 展開 Google 地圖短網址，讓前端取出座標 */
export const GET = route(async (req: NextRequest) => {
  await requireApiViewer();
  const input = req.nextUrl.searchParams.get("url") ?? "";
  if (!isShortMapLink(input)) throw new HttpError(400, "只支援 Google 地圖分享短網址（maps.app.goo.gl）");
  let url: string | null = null;
  try {
    url = await resolveShortMapLink(input);
  } catch {
    url = null;
  }
  if (!url) throw new HttpError(502, "無法展開這個短網址，請在 Google 地圖中開啟後複製瀏覽器網址列的完整網址");
  return json({ url });
});
