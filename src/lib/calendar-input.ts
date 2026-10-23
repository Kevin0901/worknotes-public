import "server-only";
import { CALENDAR_COLORS } from "./calendar-utils";
import { HttpError, str } from "./http";
import type { ItemInput } from "./calendar";
import { optionalUuid } from "./validate";

/** 驗證行事曆項目的輸入資料 */
export function parseItemInput(body: Record<string, unknown>): ItemInput {
  const kind = body.kind === "task" ? "task" : body.kind === "event" ? "event" : null;
  if (!kind) throw new HttpError(400, "類型錯誤");
  const status = body.status === "doing" || body.status === "done" ? body.status : "todo";
  const color = typeof body.color === "string" && CALENDAR_COLORS.some((c) => c.key === body.color) ? body.color : null;
  const nullable = (v: unknown, field: string, max = 20) => str(v, field, { max }) || null;
  return {
    kind,
    title: str(body.title, "標題", { required: true, max: 200 })!,
    description: str(body.description, "說明", { max: 20_000, trim: false }) ?? "",
    location: nullable(body.location, "地點", 200),
    allDay: body.allDay === true,
    startDate: nullable(body.startDate, "日期"),
    startTime: nullable(body.startTime, "時間"),
    endDate: nullable(body.endDate, "結束日期"),
    endTime: nullable(body.endTime, "結束時間"),
    status,
    color,
    visibility: body.visibility === "shared" ? "shared" : "private",
    noteId: optionalUuid(body.noteId, "相關筆記") ?? null,
  };
}
