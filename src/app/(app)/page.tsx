import Link from "next/link";
import { CalendarDays, Clock, Globe, Pin, UserRound } from "lucide-react";
import { HomeActions } from "@/components/HomeActions";
import { requirePageViewer } from "@/lib/auth";
import { formatDateTime, plainExcerpt } from "@/lib/format";
import { todaySummary } from "@/lib/calendar";
import { colorValue, formatDayLabel, taipeiParts, todayKey } from "@/lib/calendar-utils";
import { trackPageView } from "@/lib/logs";
import { recentNotes } from "@/lib/notes";
import { childrenMap, countNotesDeep, locationLabel, spaceRoots } from "@/lib/tree";
import { loadWorkspace } from "@/lib/workspace";

export default async function HomePage() {
  const viewer = await requirePageViewer("/");
  await trackPageView("/", viewer);
  const today = todayKey();
  const ws = await loadWorkspace();
  const tree = ws.tree;
  const [recent, agenda] = await Promise.all([recentNotes(ws, 8), todaySummary(viewer, today)]);
  const kids = childrenMap(tree.categories);
  // 有內容的空間，以及自己可以新增內容的空間（公共區、我的空間）
  const spaces = tree.spaces
    .map((space) => ({ space, roots: spaceRoots(tree.categories, space.userId) }))
    .filter(({ space, roots }) => roots.length > 0 || space.canCreate);
  const pinned = tree.notes.filter((n) => n.pinned);
  const greetingName = viewer.user?.name?.split(" ")[0] ?? (viewer.admin ? "管理員" : "");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 md:px-10 md:pt-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold md:text-3xl">{viewer.settings.siteTitle}</h1>
        <p className="mt-2 text-sm text-muted">
          {greetingName ? `${greetingName}，你好！` : ""}目前共有 {tree.categories.length} 個分類、{tree.notes.length} 篇筆記。
          按 <kbd className="rounded border border-line px-1 text-xs">Ctrl</kbd> +{" "}
          <kbd className="rounded border border-line px-1 text-xs">K</kbd> 可以快速搜尋。
        </p>
        {viewer.canEdit && (
          <HomeActions />
        )}
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
            <CalendarDays size={15} /> 今天 {formatDayLabel(today)}
          </h2>
          <Link href="/calendar" className="text-sm text-accent hover:underline">
            開啟行事曆 →
          </Link>
        </div>
        {agenda.events.length === 0 && agenda.tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-faint">今天沒有行程，也沒有到期的待辦。</p>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {agenda.events.map((e) => (
              <Link key={e.id} href="/calendar" className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorValue(e.color) }} />
                <span className="w-14 shrink-0 text-sm tabular-nums text-muted">
                  {e.allDay || !e.startsAt ? "全天" : taipeiParts(e.startsAt).time}
                </span>
                <span className="truncate text-sm">{e.title}</span>
              </Link>
            ))}
            {agenda.tasks.map((t) => {
              const due = taipeiParts(t.startsAt!).dateKey;
              return (
                <Link key={t.id} href="/calendar" className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                  <span className="w-[4.375rem] shrink-0 text-sm">☐ 待辦</span>
                  <span className="truncate text-sm">{t.title}</span>
                  {due < today && <span className="shrink-0 rounded bg-danger-soft px-1.5 text-xs text-danger">逾期</span>}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {pinned.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Pin size={15} /> 釘選
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pinned.map((n) => (
              <Link key={n.id} href={`/n/${n.id}`} className="card p-4 transition-colors hover:bg-hover">
                <div className="flex items-center gap-2 font-medium">
                  <span>{n.icon || "📄"}</span>
                  <span className="truncate">{n.title}</span>
                </div>
                <div className="mt-1 truncate text-xs text-faint">{locationLabel(tree, n)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {spaces.map(({ space, roots }) => (
        <section key={space.key} className="mb-10">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            {space.userId ? <UserRound size={15} /> : <Globe size={15} />} {space.name}
            {space.hidden && <span className="chip font-normal">已對其他人隱藏</span>}
          </h2>
          {roots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-faint">
              {space.isMine
                ? "這裡是你的個人空間，放在這裡的分類與筆記預設只有你看得到。"
                : "還沒有任何分類"}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roots.map((c) => (
                <Link key={c.id} href={`/c/${c.id}`} className="card group p-4 transition-colors hover:bg-hover">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{c.icon || "📁"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="text-xs text-faint">{countNotesDeep(tree, c.id)} 篇筆記</div>
                    </div>
                  </div>
                  {(kids.get(c.id) ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(kids.get(c.id) ?? []).slice(0, 8).map((s) => (
                        <span key={s.id} className="chip">
                          {s.icon} {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}

      <section>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Clock size={15} /> 最近更新
        </h2>
        <div className="card divide-y divide-[var(--border)]">
          {recent.length === 0 && <p className="p-6 text-center text-sm text-faint">還沒有筆記</p>}
          {recent.map((n) => (
            <Link key={n.id} href={`/n/${n.id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hover">
              <span className="pt-0.5">{n.icon || "📄"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="truncate font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-faint">{formatDateTime(n.updatedAt)}</span>
                </div>
                <div className="truncate text-xs text-faint">{locationLabel(tree, n)}</div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{plainExcerpt(n.excerpt, 160)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
