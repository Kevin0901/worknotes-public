import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/CalendarView";
import { requirePageViewer } from "@/lib/auth";
import { listRange, listTasks } from "@/lib/calendar";
import { DATE_RE, addDays, monthGrid, monthKey, todayKey } from "@/lib/calendar-utils";
import { trackPageView } from "@/lib/logs";

export const metadata: Metadata = { title: "行事曆" };

type Search = { m?: string; view?: string; d?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const viewer = await requirePageViewer("/calendar");
  await trackPageView("/calendar", viewer);

  const today = todayKey();
  const view = sp.view === "list" ? "list" : "month";
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : monthKey(today);
  const selected = sp.d && DATE_RE.test(sp.d) ? sp.d : monthKey(today) === month ? today : `${month}-01`;

  const grid = monthGrid(month);
  const [from, to] = view === "month" ? [grid[0], addDays(grid[41], 1)] : [today, addDays(today, 61)];
  const [items, tasks] = await Promise.all([listRange(viewer, from, to), listTasks(viewer)]);

  return (
    <CalendarView
      key={`${view}-${month}-${selected}`}
      view={view}
      month={month}
      selected={selected}
      today={today}
      items={items}
      tasks={tasks}
      actor={viewer.actor}
      isAdmin={!!viewer.admin}
    />
  );
}
