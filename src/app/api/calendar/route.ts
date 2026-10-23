import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { createItem } from "@/lib/calendar";
import { parseItemInput } from "@/lib/calendar-input";
import { json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";

export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiEditor();
  const item = await createItem(parseItemInput(await readJson(req, 100_000)), viewer.actor);
  await logEvent({ event: "calendar_create", path: "/calendar", method: "POST", detail: item.title }, viewer);
  return json({ item }, 201);
});
