"use client";

import { useState } from "react";

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= v) ?? 10 * pow;
  return step * 4;
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));
const shortDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

/** 近 14 天每日頁面瀏覽次數（單一數列直條圖） */
export function DailyViewsChart({ data }: { data: { day: string; views: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.views));
  const top = niceMax(max);
  const peakIndex = max > 0 ? data.findIndex((d) => d.views === max) : -1;
  const ticks = [top, top / 2, 0];
  const H = 150;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-8 shrink-0 text-right text-[11px] text-faint" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: H }} onMouseLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t"
              style={{ top: H - (t / top) * H, borderColor: "var(--chart-grid)" }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const h = (d.views / top) * H;
              return (
                <button
                  type="button"
                  key={d.day}
                  className={`relative flex h-full flex-1 items-end justify-center rounded-sm ${active === i ? "bg-hover" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-label={`${d.day}：${d.views} 次瀏覽`}
                >
                  <span
                    className="block w-full max-w-[24px] rounded-t-[4px]"
                    style={{ height: Math.max(h, d.views > 0 ? 2 : 0), background: "var(--chart-1)" }}
                  />
                  {i === peakIndex && active === null && (
                    <span className="absolute text-[11px] font-medium text-muted" style={{ bottom: h + 4 }}>
                      {compact(d.views)}
                    </span>
                  )}
                  {active === i && (
                    <span
                      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-card px-2 py-1 text-xs shadow-pop"
                      style={{ bottom: Math.min(h + 6, H - 28) }}
                    >
                      {d.day.slice(5).replace("-", "/")}　<b>{d.views}</b> 次
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-10 mt-1.5 flex gap-[2px] text-[11px] text-faint">
        {data.map((d, i) => (
          <span key={d.day} className="flex-1 text-center">
            {(data.length - 1 - i) % 2 === 0 ? shortDay(d.day) : ""}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">以表格檢視</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">日期</th>
              <th className="py-1 text-right font-medium">瀏覽次數</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{d.day}</td>
                <td className="py-1 text-right tabular-nums">{d.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
