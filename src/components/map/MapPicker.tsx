"use client";

import dynamic from "next/dynamic";
import { Crosshair, LoaderCircle, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import {
  DEFAULT_ZOOM, isShortMapLink, parseCoordinates, placeQuery, TAIWAN_CENTER, type MapData,
} from "@/lib/map";
import { Modal } from "../Modal";

const LeafletMap = dynamic(() => import("./LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-subtle" />,
});

interface NominatimAddress {
  country_code?: string;
  postcode?: string;
  state?: string;
  county?: string;
  city?: string;
  town?: string;
  city_district?: string;
  district?: string;
  suburb?: string;
  village?: string;
  road?: string;
  house_number?: string;
}

interface Place {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";

/** 台灣地址改成「郵遞區號＋縣市＋區＋路＋號」的順序，其他國家沿用原本格式 */
function formatAddress(p: Place): string {
  const a = p.address;
  if (a?.country_code === "tw") {
    const parts = [
      a.postcode,
      a.city ?? a.county ?? a.state,
      a.city_district ?? a.district ?? a.suburb ?? a.town,
      a.road,
      a.house_number ? `${a.house_number}${/號$/.test(a.house_number) ? "" : "號"}` : "",
    ].filter(Boolean);
    if (parts.length >= 3) return parts.join("");
  }
  return p.display_name;
}

async function nominatim<T>(path: string): Promise<T> {
  const res = await fetch(`${NOMINATIM}${path}`, { headers: { "Accept-Language": "zh-TW,zh,en" } });
  if (!res.ok) throw new Error(`地址查詢服務暫時無法使用（${res.status}）`);
  return res.json() as Promise<T>;
}

/** 選擇地圖位置：搜尋地址、貼上 Google 地圖連結或座標、點地圖、目前位置 */
export function MapPicker({
  open,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: MapData | null;
  onClose: () => void;
  onConfirm: (data: MapData) => void;
}) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(initial);
  const [zoom, setZoom] = useState(initial?.zoom ?? TAIWAN_CENTER.zoom);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const addressTouched = useRef(!!initial?.address);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
  }, []);

  const place = (lat: number, lng: number, z?: number) => {
    setPoint({ lat, lng });
    if (z) setZoom(z);
    else setZoom((cur) => Math.max(cur, DEFAULT_ZOOM));
  };

  /** 點地圖後自動查詢地址（使用者沒有自己填地址時；Nominatim 限制每秒 1 次） */
  const pickOnMap = (lat: number, lng: number) => {
    setPoint({ lat, lng });
    setResults([]);
    if (addressTouched.current) return;
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(async () => {
      try {
        const p = await nominatim<Place>(`/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`);
        if (p?.display_name && !addressTouched.current) setAddress(formatAddress(p));
      } catch {
        /* 查不到地址不影響選位置 */
      }
    }, 1100);
  };

  const choose = (p: Place) => {
    place(Number(p.lat), Number(p.lon), DEFAULT_ZOOM + 1);
    if (!title.trim()) setTitle(p.name || query.trim());
    setAddress(formatAddress(p));
    addressTouched.current = true;
    setResults([]);
  };

  const geocode = async (text: string) => {
    const list = await nominatim<Place[]>(`/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(text)}`);
    if (list.length === 0) {
      setMessage("找不到這個地點，可以換個關鍵字（例如加上縣市），或直接在地圖上點選位置");
    } else if (list.length === 1) {
      choose(list[0]);
    } else {
      setResults(list);
    }
  };

  const search = async () => {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setMessage(null);
    setResults([]);
    try {
      let url = text;
      if (isShortMapLink(text)) url = (await api<{ url: string }>("GET", `/api/maps/resolve?url=${encodeURIComponent(text)}`)).url;
      const coords = parseCoordinates(url);
      if (coords) {
        place(coords.lat, coords.lng, coords.zoom);
        const name = placeQuery(url);
        if (name && !title.trim()) setTitle(name);
        if (!address.trim()) {
          addressTouched.current = false;
          pickOnMap(coords.lat, coords.lng);
        }
        return;
      }
      await geocode(/^https?:\/\//.test(url) ? placeQuery(url) ?? text : text);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return setMessage("這個瀏覽器不支援定位");
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        place(pos.coords.latitude, pos.coords.longitude, 17);
        addressTouched.current = false;
        pickOnMap(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setBusy(false);
        setMessage(err.code === err.PERMISSION_DENIED ? "沒有定位權限，請在瀏覽器設定中允許此網站使用位置" : "目前無法取得位置");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const center = point ?? TAIWAN_CENTER;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="插入地圖"
      size="lg"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary primary-action"
            disabled={!point}
            onClick={() => point && onConfirm({ ...point, zoom, title: title.trim(), address: address.trim() })}
          >
            <MapPin size={15} /> 確定
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋地址或地點，或貼上 Google 地圖連結、座標"
              className="input pl-9"
              autoFocus
            />
          </div>
          <button type="submit" className="btn" disabled={busy || !query.trim()}>
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />} 搜尋
          </button>
          <button type="button" className="btn" onClick={locate} disabled={busy} title="使用目前位置">
            <Crosshair size={15} /> <span className="hidden sm:inline">目前位置</span>
          </button>
        </form>

        {message && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm">{message}</p>}

        {results.length > 0 && (
          <ul className="max-h-48 divide-y divide-[var(--border)] overflow-y-auto thin-scroll rounded-lg border border-line">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-hover">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-faint" />
                  <span className="min-w-0">
                    {r.name && <span className="block font-medium">{r.name}</span>}
                    <span className="block text-xs text-muted">{formatAddress(r)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="overflow-hidden rounded-lg border border-line">
          <LeafletMap
            lat={center.lat}
            lng={center.lng}
            zoom={point ? zoom : TAIWAN_CENTER.zoom}
            marker={!!point}
            title={title}
            onPick={pickOnMap}
            onZoom={setZoom}
            className="h-64 sm:h-72"
          />
        </div>
        <p className="text-xs text-muted">
          {point ? "可以點地圖或拖曳紅色標記微調位置。" : "搜尋地點，或直接在地圖上點一下選擇位置。"}
          地圖資料 © OpenStreetMap 貢獻者。
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">名稱</span>
            <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="例如：A 公司新竹廠" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">地址</span>
            <input
              className="input"
              value={address}
              maxLength={300}
              onChange={(e) => {
                addressTouched.current = true;
                setAddress(e.target.value);
              }}
              placeholder="選填"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
