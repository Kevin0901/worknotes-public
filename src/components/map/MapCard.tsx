"use client";

import dynamic from "next/dynamic";
import { Check, Copy, ExternalLink, MapPin, Navigation } from "lucide-react";
import { useState, type ReactNode } from "react";
import { appleMapsUrl, coordText, googleDirectionsUrl, googleMapsUrl, type MapData } from "@/lib/map";

// Leaflet 只能在瀏覽器執行
const LeafletMap = dynamic(() => import("./LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-subtle" />,
});

const linkBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 py-1.5 text-xs font-medium text-fg no-underline hover:bg-hover";

/** 筆記中的地圖卡片：互動地圖 + 導航按鈕 */
export function MapCard({ data, actions }: { data: MapData; actions?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coordText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="map-card not-prose my-4 overflow-hidden rounded-lg border border-line bg-card">
      <LeafletMap lat={data.lat} lng={data.lng} zoom={data.zoom} title={data.title} className="h-64 md:h-80" />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin size={15} className="shrink-0 text-danger" />
            <span className="truncate">{data.title || "地點"}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{data.address || coordText(data)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a className={linkBtn} href={googleDirectionsUrl(data)} target="_blank" rel="noopener noreferrer">
            <Navigation size={13} /> Google 導航
          </a>
          <a className={linkBtn} href={appleMapsUrl(data)} target="_blank" rel="noopener noreferrer">
            <Navigation size={13} /> Apple 地圖
          </a>
          <a className={linkBtn} href={googleMapsUrl(data)} target="_blank" rel="noopener noreferrer" title="在 Google 地圖查看">
            <ExternalLink size={13} /> 開啟
          </a>
          <button type="button" className={linkBtn} onClick={copy} title={coordText(data)}>
            {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />} {copied ? "已複製" : "複製座標"}
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
}
