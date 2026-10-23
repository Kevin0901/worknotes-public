import { requireAiViewer, requireUserId } from "@/lib/ai/api";
import { deleteAllConversations, listConversations } from "@/lib/ai/conversations";
import { json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";

export const GET = route(async () => {
  const { userId } = await requireAiViewer();
  return json({ conversations: userId ? await listConversations(userId) : [] });
});

export const DELETE = route(async () => {
  const { viewer, userId } = await requireAiViewer();
  const count = await deleteAllConversations(requireUserId(userId));
  await logEvent({ event: "ai_chat_delete", path: "/ai", method: "DELETE", detail: `全部（${count} 段）` }, viewer);
  return json({ deleted: count });
});
