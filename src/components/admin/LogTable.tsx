import { eventLabel } from "@/lib/events";
import { formatDateTime } from "@/lib/format";
import { summarizeUserAgent } from "@/lib/ua";
import type { AccessLog } from "@/lib/types";

function tone(event: string): string {
  if (event === "page_view") return "bg-hover text-muted";
  if (/failed|blocked|denied|error|closed/.test(event)) return "bg-danger-soft text-danger";
  if (/pending|waiting/.test(event)) return "bg-warn-soft text-warn";
  if (/login_success|approve/.test(event)) return "bg-accent-soft text-accent";
  return "bg-hover text-fg";
}

export function LogTable({ rows, compact = false }: { rows: AccessLog[]; compact?: boolean }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-faint">沒有符合的紀錄</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="px-2 py-2 font-medium">時間</th>
            <th className="px-2 py-2 font-medium">事件</th>
            <th className="px-2 py-2 font-medium">身分</th>
            <th className="px-2 py-2 font-medium">IP／地區</th>
            <th className="px-2 py-2 font-medium">路徑／詳細</th>
            {!compact && <th className="px-2 py-2 font-medium">裝置</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top last:border-0">
              <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted">{formatDateTime(r.createdAt, true)}</td>
              <td className="px-2 py-2">
                <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${tone(r.event)}`}>
                  {eventLabel(r.event)}
                </span>
              </td>
              <td className="max-w-[220px] px-2 py-2 text-xs">
                <span className="break-all">{r.actor ?? <span className="text-faint">訪客</span>}</span>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-xs">
                <div className="font-mono">{r.ip ?? "—"}</div>
                {(r.country || r.city) && (
                  <div className="text-faint">{[r.country, r.city].filter(Boolean).join(" · ")}</div>
                )}
              </td>
              <td className="max-w-[320px] px-2 py-2 text-xs">
                {r.path && (
                  <div className="break-all font-mono text-muted">
                    {r.method && r.method !== "GET" && <span className="mr-1 text-faint">{r.method}</span>}
                    {r.path}
                  </div>
                )}
                {r.detail && <div className="mt-0.5 break-all">{r.detail}</div>}
              </td>
              {!compact && (
                <td className="whitespace-nowrap px-2 py-2 text-xs text-muted" title={r.userAgent ?? undefined}>
                  {summarizeUserAgent(r.userAgent)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
