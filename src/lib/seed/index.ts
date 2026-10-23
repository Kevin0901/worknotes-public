import "server-only";
import type { Sql } from "../db";
import { DEFAULT_SEED } from "./default";

export interface SeedNote {
  title: string;
  icon?: string;
  tags: string[];
  pinned?: boolean;
  content: string;
}

export interface SeedCategory {
  name: string;
  icon: string;
  notes?: SeedNote[];
  children?: SeedCategory[];
}

const SEED_VERSION = 1;
const SEED_AUTHOR = "system";

async function insertCategory(sql: Sql, cat: SeedCategory, parentId: string | null, order: number) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO categories (parent_id, name, icon, sort_order)
    VALUES (${parentId}, ${cat.name}, ${cat.icon}, ${order})
    RETURNING id`;
  let i = 0;
  for (const note of cat.notes ?? []) {
    await sql`
      INSERT INTO notes (category_id, title, icon, content, tags, pinned, sort_order, created_by, updated_by)
      VALUES (${row.id}, ${note.title}, ${note.icon ?? null}, ${note.content.trim() + "\n"},
              ${note.tags}, ${note.pinned ?? false}, ${i++}, ${SEED_AUTHOR}, ${SEED_AUTHOR})`;
  }
  let j = 0;
  for (const child of cat.children ?? []) {
    await insertCategory(sql, child, row.id, j++);
  }
}

/** 第一次啟動時匯入預設筆記（只會執行一次；之後刪除也不會再自動補回） */
export async function seedDatabase(sql: Sql): Promise<void> {
  const done = await sql`SELECT 1 FROM app_settings WHERE key = 'seed_version'`;
  if (done.length > 0) return;
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM categories`;
  if (count === 0) {
    for (const [i, category] of DEFAULT_SEED.entries()) await insertCategory(sql, category, null, i);
  }
  await sql`
    INSERT INTO app_settings (key, value) VALUES ('seed_version', ${sql.json(SEED_VERSION)})
    ON CONFLICT (key) DO NOTHING`;
}
