"use client";

import "leaflet/dist/leaflet.css";
import type { DivIcon, LeafletMouseEvent, Map as LMap, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 貢獻者';

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 39s13-13.2 13-23.5C28 7.5 22.2 2 15 2S2 7.5 2 15.5C2 25.8 15 39 15 39z" fill="#e5484d" stroke="#fff" stroke-width="2.5"/><circle cx="15" cy="15.5" r="5" fill="#fff"/></svg>`;

export interface LeafletMapProps {
  lat: number;
  lng: number;
  zoom: number;
  /** 是否顯示標記 */
  marker?: boolean;
  title?: string;
  /** 編輯模式：點地圖或拖曳標記來選位置 */
  onPick?: (lat: number, lng: number) => void;
  onZoom?: (zoom: number) => void;
  className?: string;
}

/**
 * OpenStreetMap 互動地圖（Leaflet，免費、不需要 API 金鑰）。
 * 為了不影響頁面捲動：滑鼠滾輪要先點一下地圖才會縮放；手機要先點一下才能用單指拖曳。
 */
export function LeafletMap({ lat, lng, zoom, marker = true, title, onPick, onZoom, className = "" }: LeafletMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const leafletRef = useRef<{ L: typeof import("leaflet"); icon: DivIcon } | null>(null);
  const callbacks = useRef({ onPick, onZoom });
  callbacks.current = { onPick, onZoom };
  const [touchLocked, setTouchLocked] = useState(false);
  const [ready, setReady] = useState(false);

  // 建立地圖（只做一次）
  useEffect(() => {
    let cancelled = false;
    let map: LMap | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      map = L.map(ref.current, {
        center: [lat, lng],
        zoom,
        scrollWheelZoom: false,
        dragging: !touch || !!callbacks.current.onPick,
        attributionControl: true,
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
      const icon = L.divIcon({ html: PIN_SVG, className: "wn-map-pin", iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -36] });
      leafletRef.current = { L, icon };
      map.on("click", (e: LeafletMouseEvent) => {
        map!.scrollWheelZoom.enable();
        callbacks.current.onPick?.(e.latlng.lat, e.latlng.lng);
      });
      map.on("mouseout", () => map!.scrollWheelZoom.disable());
      map.on("zoomend", () => callbacks.current.onZoom?.(map!.getZoom()));
      if (touch && !callbacks.current.onPick) setTouchLocked(true);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // 位置改變時移動地圖與標記
  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;
    if (marker && !markerRef.current) {
      const m = leaflet.L.marker([lat, lng], { icon: leaflet.icon, draggable: !!callbacks.current.onPick, keyboard: false });
      m.on("dragend", () => {
        const p = m.getLatLng();
        callbacks.current.onPick?.(p.lat, p.lng);
      });
      markerRef.current = m.addTo(map);
    } else if (!marker && markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    markerRef.current?.setLatLng([lat, lng]);
    const c = map.getCenter();
    if (Math.abs(c.lat - lat) > 1e-7 || Math.abs(c.lng - lng) > 1e-7 || map.getZoom() !== zoom) {
      map.setView([lat, lng], zoom, { animate: false });
    }
  }, [lat, lng, zoom, marker, ready]);

  useEffect(() => {
    markerRef.current?.unbindTooltip();
    if (title && markerRef.current) {
      // Leaflet 會把字串當 HTML 插入，標題來自筆記內容，必須以純文字顯示
      const label = document.createElement("span");
      label.textContent = title;
      markerRef.current.bindTooltip(label, { direction: "top", offset: [0, -36] });
    }
  }, [title, ready, marker, lat, lng]);

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={ref} className="wn-map h-full w-full" />
      {touchLocked && (
        <button
          type="button"
          className="absolute inset-0 z-[500] flex items-end justify-center bg-transparent pb-3"
          onClick={() => {
            mapRef.current?.dragging.enable();
            setTouchLocked(false);
          }}
        >
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">點一下即可移動地圖</span>
        </button>
      )}
    </div>
  );
}
