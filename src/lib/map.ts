// 筆記中的地圖區塊（前後端共用的純函式）
//
// 在 Markdown 中以程式碼區塊保存，其他 Markdown 工具也能正常閱讀：
// ```map
// lat: 25.033964
// lng: 121.564468
// zoom: 16
// title: 台北 101
// address: 110 台北市信義區信義路五段 7 號
// ```

export interface MapData {
  lat: number;
  lng: number;
  zoom: number;
  title: string;
  address: string;
}

export const DEFAULT_ZOOM = 16;
/** 沒有位置時的預設中心（台灣） */
export const TAIWAN_CENTER = { lat: 23.7, lng: 120.95, zoom: 7 };

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function parseMapBlock(text: string): MapData | null {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([a-zA-Z]+)\s*[:：]\s*(.*?)\s*$/.exec(line);
    if (m) fields[m[1].toLowerCase()] = m[2];
  }
  const lat = Number(fields.lat);
  const lng = Number(fields.lng ?? fields.lon);
  if (!isValidLatLng(lat, lng)) return null;
  const zoom = Math.round(Number(fields.zoom));
  return {
    lat,
    lng,
    zoom: zoom >= 1 && zoom <= 19 ? zoom : DEFAULT_ZOOM,
    title: (fields.title ?? "").slice(0, 200),
    address: (fields.address ?? "").slice(0, 300),
  };
}

export function serializeMapBlock(d: MapData): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const lines = [`lat: ${round(d.lat)}`, `lng: ${round(d.lng)}`, `zoom: ${d.zoom}`];
  if (clean(d.title)) lines.push(`title: ${clean(d.title)}`);
  if (clean(d.address)) lines.push(`address: ${clean(d.address)}`);
  return lines.join("\n");
}

export const coordText = (d: { lat: number; lng: number }) => `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}`;

/** Google 地圖導航（手機會開啟 Google Maps App） */
export const googleDirectionsUrl = (d: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;

export const googleMapsUrl = (d: { lat: number; lng: number }) =>
  `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;

/** Apple 地圖導航（iPhone／Mac） */
export const appleMapsUrl = (d: { lat: number; lng: number; title?: string }) =>
  `https://maps.apple.com/?daddr=${d.lat},${d.lng}${d.title ? `&q=${encodeURIComponent(d.title)}` : ""}`;

export const osmUrl = (d: { lat: number; lng: number; zoom?: number }) =>
  `https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=${d.zoom ?? DEFAULT_ZOOM}/${d.lat}/${d.lng}`;

/**
 * 從座標文字或地圖網址取出經緯度：
 * 「25.03, 121.56」、Google 地圖（@lat,lng,17z、!3d…!4d…、q=、query=、destination=、ll=）、
 * Apple 地圖（ll=、q=、daddr=）、OpenStreetMap（mlat/mlon、#map=z/lat/lng）
 */
export function parseCoordinates(input: string): { lat: number; lng: number; zoom?: number } | null {
  const text = input.trim();
  if (!text) return null;
  let s = text;
  try {
    s = decodeURIComponent(text);
  } catch {
    /* ignore */
  }
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const pick = (re: RegExp, zoomGroup?: number) => {
    const m = re.exec(s);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!isValidLatLng(lat, lng)) return null;
    const zoom = zoomGroup ? Math.round(Number(m[zoomGroup])) : undefined;
    return { lat, lng, ...(zoom && zoom >= 1 && zoom <= 21 ? { zoom: Math.min(zoom, 19) } : {}) };
  };
  return (
    // Google：!3d緯度!4d經度（地點的實際位置，比 @ 的畫面中心準確）
    pick(new RegExp(`!3d${num}!4d${num}`)) ??
    // OSM：#map=17/25.03/121.56
    (() => {
      const m = new RegExp(`#map=(\\d{1,2})/${num}/${num}`).exec(s);
      if (!m) return null;
      const lat = Number(m[2]);
      const lng = Number(m[3]);
      return isValidLatLng(lat, lng) ? { lat, lng, zoom: Math.min(Number(m[1]), 19) } : null;
    })() ??
    pick(new RegExp(`mlat=${num}&mlon=${num}`)) ??
    pick(new RegExp(`[?&](?:q|query|destination|daddr|ll|sll|center)=${num}\\s*,\\s*${num}`)) ??
    // Google：/@25.03,121.56,17z
    pick(new RegExp(`@${num},${num}(?:,(\\d{1,2}(?:\\.\\d+)?)z)?`), 3) ??
    // 純座標：25.03, 121.56 或 25.03 121.56
    pick(new RegExp(`^${num}\\s*[,，\\s]\\s*${num}$`))
  );
}

/** Google 地圖網址中的地點名稱或搜尋文字（沒有座標時可用來搜尋） */
export function placeQuery(url: string): string | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q") ?? u.searchParams.get("query") ?? u.searchParams.get("destination");
    if (q && !parseCoordinates(q)) return q;
    const m = /\/maps\/place\/([^/@]+)/.exec(u.pathname);
    if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
  } catch {
    /* ignore */
  }
  return null;
}

/** 需要由伺服器展開的短網址 */
export function isShortMapLink(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === "https:" && (u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")));
  } catch {
    return false;
  }
}
