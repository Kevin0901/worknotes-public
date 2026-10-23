import "server-only";
// AI 對話紀錄：只屬於建立者本人（以 Google 帳號登入的使用者），其他人與管理員後台都看不到。
import { db } from "../db";
import { HttpError } from "../http";
import type { ChatSource } from "./catalog";

export interface ConversationInfo {
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  provider: string | null;
  model: string | null;
  createdAt: string;
}

const MAX_CONVERSATIONS = 300;

export async function listConversations(userId: string): Promise<ConversationInfo[]> {
  const sql = await db();
  const rows = await sql<{ id: string; title: string; provider: string | null; model: string | null; updated_at: Date }[]>`
    SELECT id, title, provider, model, updated_at FROM ai_conversations
    WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT ${MAX_CONVERSATIONS}`;
  return rows.map((r) => ({ id: r.id, title: r.title, provider: r.provider, model: r.model, updatedAt: r.updated_at.toISOString() }));
}

export async function getConversation(userId: string, id: string): Promise<{ conversation: ConversationInfo; messages: StoredMessage[] }> {
  const sql = await db();
  const conv = await sql<{ id: string; title: string; provider: string | null; model: string | null; updated_at: Date }[]>`
    SELECT id, title, provider, model, updated_at FROM ai_conversations WHERE id = ${id} AND user_id = ${userId}`;
  if (!conv[0]) throw new HttpError(404, "找不到這段對話");
  const rows = await sql<{ id: string; role: string; content: string; sources: ChatSource[]; provider: string | null; model: string | null; created_at: Date }[]>`
    SELECT id::text, role, content, sources, provider, model, created_at FROM ai_messages
    WHERE conversation_id = ${id} ORDER BY id`;
  const c = conv[0];
  return {
    conversation: { id: c.id, title: c.title, provider: c.provider, model: c.model, updatedAt: c.updated_at.toISOString() },
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      sources: Array.isArray(r.sources) ? r.sources : [],
      provider: r.provider,
      model: r.model,
      createdAt: r.created_at.toISOString(),
    })),
  };
}

export async function createConversation(userId: string, title: string, provider: string, model: string): Promise<string> {
  const sql = await db();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ai_conversations (user_id, title, provider, model) VALUES (${userId}, ${title}, ${provider}, ${model}) RETURNING id`;
  // 超過上限時刪除最舊的對話
  await sql`
    DELETE FROM ai_conversations WHERE user_id = ${userId} AND id IN (
      SELECT id FROM ai_conversations WHERE user_id = ${userId} ORDER BY updated_at DESC OFFSET ${MAX_CONVERSATIONS})`;
  return rows[0].id;
}

/** 確認對話屬於這位使用者 */
export async function assertConversation(userId: string, id: string): Promise<void> {
  const sql = await db();
  const rows = await sql`SELECT 1 FROM ai_conversations WHERE id = ${id} AND user_id = ${userId}`;
  if (!rows.length) throw new HttpError(404, "找不到這段對話");
}

export async function appendMessage(
  conversationId: string,
  m: { role: "user" | "assistant"; content: string; sources?: ChatSource[]; provider?: string; model?: string },
): Promise<string> {
  const sql = await db();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ai_messages (conversation_id, role, content, sources, provider, model)
    VALUES (${conversationId}, ${m.role}, ${m.content}, ${sql.json((m.sources ?? []) as unknown as Parameters<typeof sql.json>[0])}, ${m.provider ?? null}, ${m.model ?? null})
    RETURNING id::text`;
  await sql`
    UPDATE ai_conversations SET updated_at = now(), provider = COALESCE(${m.provider ?? null}, provider), model = COALESCE(${m.model ?? null}, model)
    WHERE id = ${conversationId}`;
  return rows[0].id;
}

export async function renameConversation(userId: string, id: string, title: string): Promise<void> {
  const sql = await db();
  const rows = await sql`UPDATE ai_conversations SET title = ${title} WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  if (!rows.length) throw new HttpError(404, "找不到這段對話");
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  const sql = await db();
  const rows = await sql`DELETE FROM ai_conversations WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  if (!rows.length) throw new HttpError(404, "找不到這段對話");
}

export async function deleteAllConversations(userId: string): Promise<number> {
  const sql = await db();
  const rows = await sql`DELETE FROM ai_conversations WHERE user_id = ${userId} RETURNING id`;
  return rows.length;
}
