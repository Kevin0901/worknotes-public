import "server-only";
import { canCreateInSpace, canManage, defaultVisibility } from "./access";
import { db, type Sql } from "./db";
import { HttpError } from "./http";
import { isStrongTerm } from "./search-terms";
import { descendantIds as treeDescendants } from "./tree";
import type { Category, Note, NoteMeta, Revision, Visibility } from "./types";
import {
  CATEGORY_COLUMNS, NOTE_META_COLUMNS, requireVisibleCategory,
  type CategoryRow, type ItemAccess, type NoteMetaRow, type Workspace,
} from "./workspace";

const MAX_REVISIONS = 30;

interface NoteRow extends NoteMetaRow {
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

const toMeta = (r: NoteMetaRow, a: ItemAccess): NoteMeta => ({
  id: r.id,
  categoryId: r.category_id,
  title: r.title,
  icon: r.icon,
  tags: r.tags ?? [],
  pinned: r.pinned,
  sortOrder: r.sort_order,
  updatedAt: r.updated_at.toISOString(),
  ownerId: r.owner_id,
  spaceUserId: r.space_user_id,
  visibility: r.visibility as Visibility,
  canEdit: a.canEdit,
  canManage: a.canManage,
});

const toNote = (r: NoteRow, a: ItemAccess): Note => ({
  ...toMeta(r, a),
  content: r.content ?? "",
  createdBy: r.created_by ?? null,
  updatedBy: r.updated_by ?? null,
  createdAt: (r.created_at ?? r.updated_at).toISOString(),
  deletedAt: r.deleted_at?.toISOString() ?? null,
});

const NO_ACCESS = "你沒有編輯這篇筆記的權限";

/** 依 tree 的順序取出筆記，再附上內容摘要 */
async function withExcerpts(ws: Workspace, ids: string[]): Promise<(NoteMeta & { excerpt: string })[]> {
  if (ids.length === 0) return [];
  const sql = await db();
  const rows = await sql<{ id: string; excerpt: string }[]>`
    SELECT id, left(content, 400) AS excerpt FROM notes WHERE id = ANY(${ids}::uuid[])`;
  const excerpt = new Map(rows.map((r) => [r.id, r.excerpt]));
  return ids.flatMap((id) => {
    const meta = ws.noteById.get(id);
    return meta ? [{ ...meta, excerpt: excerpt.get(id) ?? "" }] : [];
  });
}

// ───────────── 讀取 ─────────────

/** 取得筆記（含垃圾桶中的）；沒有查看權限時回傳 null */
export async function getNote(ws: Workspace, id: string): Promise<Note | null> {
  const sql = await db();
  const rows = await sql<NoteRow[]>`SELECT * FROM notes WHERE id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  const access = ws.noteAccess(row);
  return access.canView ? toNote(row, access) : null;
}

export async function findNoteByTitle(ws: Workspace, title: string): Promise<string | null> {
  const key = title.trim().toLowerCase();
  const matches = ws.tree.notes.filter((n) => n.title.trim().toLowerCase() === key);
  if (matches.length === 0) return null;
  // 同名時優先：自己空間 → 公共區 → 其他；再依更新時間
  const rank = (n: NoteMeta) => (n.spaceUserId && n.spaceUserId === ws.subject.userId ? 0 : n.spaceUserId ? 2 : 1);
  matches.sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  return matches[0].id;
}

export async function recentNotes(ws: Workspace, limit = 8): Promise<(NoteMeta & { excerpt: string })[]> {
  const ids = [...ws.tree.notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((n) => n.id);
  return withExcerpts(ws, ids);
}

/** 分類中的筆記；categoryId 為 null 時是某個空間的「未分類」 */
export async function notesInCategory(
  ws: Workspace,
  categoryId: string | null,
  spaceUserId: string | null = null,
): Promise<(NoteMeta & { excerpt: string })[]> {
  const ids = ws.tree.notes
    .filter((n) => (categoryId ? n.categoryId === categoryId : !n.categoryId && n.spaceUserId === spaceUserId))
    .map((n) => n.id);
  return withExcerpts(ws, ids);
}

export interface SearchHit extends NoteMeta {
  snippet: string;
}

export async function searchNotes(ws: Workspace, query: string): Promise<SearchHit[]> {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0 || ws.visibleNoteIds.length === 0) return [];
  const sql = await db();
  const patterns = terms.map((t) => `%${t.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
  const rows = await sql<{ id: string; content: string }[]>`
    SELECT id, content FROM notes
    WHERE deleted_at IS NULL AND id = ANY(${ws.visibleNoteIds}::uuid[]) AND (
      SELECT bool_and(title ILIKE p OR content ILIKE p OR array_to_string(tags, ' ') ILIKE p)
      FROM unnest(${patterns}::text[]) AS p
    )
    ORDER BY (title ILIKE ${patterns[0]}) DESC, updated_at DESC
    LIMIT 100`;
  const first = terms[0].toLowerCase();
  return rows.flatMap((r) => {
    const meta = ws.noteById.get(r.id);
    if (!meta) return [];
    const lower = r.content.toLowerCase();
    const at = lower.indexOf(first);
    const start = Math.max(0, at - 60);
    const snippet = at >= 0 ? r.content.slice(start, start + 220) : r.content.slice(0, 220);
    return [{ ...meta, snippet: (start > 0 ? "…" : "") + snippet.replace(/\s+/g, " ") }];
  });
}

/** 關鍵字轉成 PostgreSQL 正規表示式：英數字詞加字邊界（避免 ip 比對到 zip），中文直接比對 */
function termRegex(term: string): string {
  const escaped = term.replace(/[\\^$.|?*+()[\]{}]/g, (m) => "\\" + m);
  return /^[a-z0-9]/i.test(term) ? `\\m${escaped}\\M` : escaped;
}

/**
 * AI 助理用：為「看得到的筆記」計算與問題的相關度，可再限定在指定的筆記範圍內。
 * 分數 = 關鍵字覆蓋率（依 IDF 加權：越多筆記都有的詞越不重要）＋ 標題覆蓋率 × 0.5，範圍 0～1.5。
 * 完全沒出現在任何筆記中的關鍵字不計入，避免中文二字詞的雜訊拉低分數。
 */
export async function rankNotesForQuery(
  ws: Workspace,
  terms: string[],
  { within, limit = 8 }: { within?: string[]; limit?: number } = {},
): Promise<{ id: string; score: number }[]> {
  const scope = (within ?? ws.visibleNoteIds).filter((id) => ws.noteById.has(id));
  if (terms.length === 0 || scope.length === 0) return [];
  const list = terms.slice(0, 24);
  const regexes = list.map(termRegex);
  // 英數字的關鍵字（例如 api）即使沒有任何筆記出現也計入總分，讓「問的主題不在筆記裡」時分數變低
  const strong = list.map((t) => (isStrongTerm(t) ? 1 : 0));
  const sql = await db();
  const rows = await sql<{ id: string; score: number }[]>`
    WITH scope AS (
      SELECT id, title, array_to_string(tags, ' ') AS tags, content, updated_at
      FROM notes WHERE deleted_at IS NULL AND id = ANY(${scope}::uuid[])
    ),
    q AS (SELECT re, strong, ord FROM unnest(${regexes}::text[], ${strong}::int[]) WITH ORDINALITY AS x(re, strong, ord)),
    df AS (
      SELECT q.ord, q.re, q.strong, count(s.id) AS n
      FROM q LEFT JOIN scope s ON (s.title || ' ' || s.tags || ' ' || s.content) ~* q.re
      GROUP BY q.ord, q.re, q.strong
    ),
    w AS (
      SELECT ord, re, CASE WHEN n > 0 THEN greatest(ln((${scope.length}::float + 1) / (n + 0.5)), 0.05) ELSE 1.0 END AS weight
      FROM df WHERE n > 0 OR strong = 1
    ),
    total AS (SELECT sum(weight) AS t FROM w)
    SELECT s.id,
      (sum(w.weight * ((s.title ~* w.re OR s.tags ~* w.re OR s.content ~* w.re)::int))
        + 0.5 * sum(w.weight * ((s.title ~* w.re OR s.tags ~* w.re)::int))) / max(total.t) AS score
    FROM scope s CROSS JOIN w CROSS JOIN total
    GROUP BY s.id, s.updated_at
    HAVING sum((s.title ~* w.re OR s.tags ~* w.re OR s.content ~* w.re)::int) > 0
    ORDER BY score DESC, s.updated_at DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, score: Number(r.score) }));
}

/** AI 助理用：讀取指定筆記的內容（只回傳目前使用者看得到、不在垃圾桶的筆記） */
export async function readNotesForAssistant(ws: Workspace, ids: string[]): Promise<{ meta: NoteMeta; content: string }[]> {
  const visible = [...new Set(ids)].filter((id) => ws.noteById.has(id)).slice(0, 200);
  if (visible.length === 0) return [];
  const sql = await db();
  const rows = await sql<{ id: string; content: string }[]>`
    SELECT id, content FROM notes WHERE deleted_at IS NULL AND id = ANY(${visible}::uuid[])`;
  const content = new Map(rows.map((r) => [r.id, r.content ?? ""]));
  return visible.flatMap((id) => (content.has(id) ? [{ meta: ws.noteById.get(id)!, content: content.get(id)! }] : []));
}

/** 垃圾桶：只列出目前使用者看得到的筆記 */
export async function listTrash(ws: Workspace): Promise<(NoteMeta & { deletedAt: string })[]> {
  const sql = await db();
  const rows = await sql<(NoteMetaRow & { deleted_at: Date })[]>`
    SELECT ${sql(NOTE_META_COLUMNS)}, deleted_at FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`;
  return rows.flatMap((r) => {
    const access = ws.noteAccess(r);
    return access.canView ? [{ ...toMeta(r, access), deletedAt: r.deleted_at.toISOString() }] : [];
  });
}

export async function listRevisions(ws: Workspace, noteId: string): Promise<Revision[]> {
  if (!(await getNote(ws, noteId))) throw new HttpError(404, "找不到筆記");
  const sql = await db();
  const rows = await sql<{ id: string; title: string; content: string; edited_by: string | null; created_at: Date }[]>`
    SELECT id, title, content, edited_by, created_at FROM note_revisions
    WHERE note_id = ${noteId} ORDER BY created_at DESC, id DESC`;
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    content: r.content,
    editedBy: r.edited_by,
    createdAt: r.created_at.toISOString(),
  }));
}

// ───────────── 位置與權限 ─────────────

interface Placement {
  categoryId: string | null;
  spaceUserId: string | null;
  parentVisibility: Visibility | null;
}

/** 檢查能否在指定分類（或某個空間最上層）新增／移入內容，回傳實際所在空間 */
function placement(ws: Workspace, categoryId: string | null, spaceUserId: string | null): Placement {
  if (categoryId) {
    const c = requireVisibleCategory(ws, categoryId);
    if (!c.canEdit) throw new HttpError(403, `你沒有在「${c.name}」新增或移入內容的權限`);
    return { categoryId, spaceUserId: c.spaceUserId, parentVisibility: c.visibility };
  }
  if (!canCreateInSpace(ws.subject, spaceUserId)) {
    throw new HttpError(403, ws.subject.canEditRole ? "你不能在其他人的空間新增內容" : "你的帳號只有檢視權限");
  }
  return { categoryId: null, spaceUserId, parentVisibility: null };
}

/**
 * 非擁有者移動別人的項目時：不能換空間，也只能移到「他人可看可編輯」的分類，
 * 避免把別人的東西藏進自己的私人分類。
 */
function assertOpenDestination(ws: Workspace, place: Placement, currentSpace: string | null) {
  if (place.spaceUserId !== currentSpace) throw new HttpError(403, "只有擁有者或管理員可以移到其他空間");
  if (place.categoryId && !ws.isOpenCategory(place.categoryId)) {
    throw new HttpError(403, "別人的項目只能移到「他人可看可編輯」的分類");
  }
}

/** 同一層的兄弟項目：同一個上層分類，或同一個空間的最上層 */
const noteSiblings = (sql: Sql, categoryId: string | null, spaceUserId: string | null) =>
  categoryId
    ? sql`category_id = ${categoryId}`
    : sql`category_id IS NULL AND space_user_id IS NOT DISTINCT FROM ${spaceUserId}`;

const categorySiblings = (sql: Sql, parentId: string | null, spaceUserId: string | null) =>
  parentId
    ? sql`parent_id = ${parentId}`
    : sql`parent_id IS NULL AND space_user_id IS NOT DISTINCT FROM ${spaceUserId}`;

async function lockNoteForEdit(tx: Sql, ws: Workspace, id: string, deleted: boolean): Promise<NoteRow> {
  const rows = await tx<NoteRow[]>`SELECT * FROM notes WHERE id = ${id} FOR UPDATE`;
  const row = rows[0];
  if (!row || !!row.deleted_at !== deleted) {
    throw new HttpError(404, deleted ? "垃圾桶中找不到這篇筆記" : "找不到筆記");
  }
  const access = ws.noteAccess(row);
  if (!access.canView) throw new HttpError(404, "找不到筆記");
  if (!access.canEdit) throw new HttpError(403, NO_ACCESS);
  return row;
}

// ───────────── 筆記異動 ─────────────

export interface NoteInput {
  categoryId: string | null;
  /** categoryId 為 null 時放在哪個空間（null = 公共區） */
  spaceUserId: string | null;
  title: string;
  icon?: string | null;
  content?: string;
  tags?: string[];
  visibility?: Visibility;
}

export async function createNote(ws: Workspace, input: NoteInput): Promise<Note> {
  const place = placement(ws, input.categoryId, input.spaceUserId);
  const visibility = input.visibility ?? defaultVisibility(place.parentVisibility, place.spaceUserId);
  const actor = ws.viewer.actor;
  const sql = await db();
  const rows = await sql<NoteRow[]>`
    INSERT INTO notes (category_id, title, icon, content, tags, sort_order, created_by, updated_by, owner_id, space_user_id, visibility)
    VALUES (${place.categoryId}, ${input.title}, ${input.icon ?? null}, ${input.content ?? ""}, ${input.tags ?? []},
      (SELECT COALESCE(max(sort_order), -1) + 1 FROM notes WHERE ${noteSiblings(sql, place.categoryId, place.spaceUserId)}),
      ${actor}, ${actor}, ${ws.subject.userId}, ${place.spaceUserId}, ${visibility})
    RETURNING *`;
  return toNote(rows[0], ws.noteAccess(rows[0]));
}

export interface NotePatch {
  title?: string;
  icon?: string | null;
  content?: string;
  tags?: string[];
  pinned?: boolean;
  /** 移到其他分類（null = 空間最上層／未分類） */
  categoryId?: string | null;
  /** 移到其他空間的最上層（需搭配 categoryId = null） */
  spaceUserId?: string | null;
  visibility?: Visibility;
}

export async function updateNote(ws: Workspace, id: string, patch: NotePatch, baseUpdatedAt?: string): Promise<Note> {
  const sql = await db();
  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const current = await lockNoteForEdit(tx, ws, id, false);
    const access = ws.noteAccess(current);
    if (baseUpdatedAt && new Date(baseUpdatedAt).getTime() !== current.updated_at.getTime()) {
      throw new HttpError(409, "這篇筆記已被其他人修改，請重新整理後再編輯（你的內容尚未儲存，可先複製備份）");
    }

    // 移動（分類或空間）
    let categoryId = current.category_id;
    let spaceUserId = current.space_user_id;
    const targetCategory = patch.categoryId !== undefined ? patch.categoryId : current.category_id;
    const targetSpace = targetCategory ? null : patch.spaceUserId !== undefined ? patch.spaceUserId : current.space_user_id;
    if (targetCategory !== current.category_id || (!targetCategory && targetSpace !== current.space_user_id)) {
      const place = placement(ws, targetCategory, targetSpace);
      if (!access.canManage) assertOpenDestination(ws, place, current.space_user_id);
      categoryId = place.categoryId;
      spaceUserId = place.spaceUserId;
    }
    const moved = categoryId !== current.category_id || spaceUserId !== current.space_user_id;

    const visibility = patch.visibility ?? (current.visibility as Visibility);
    if (visibility !== current.visibility && !access.canManage) {
      throw new HttpError(403, "只有擁有者或管理員可以變更可見度");
    }

    const titleChanged = patch.title !== undefined && patch.title !== current.title;
    const contentChanged = patch.content !== undefined && patch.content !== current.content;
    if (titleChanged || contentChanged) {
      await tx`
        INSERT INTO note_revisions (note_id, title, content, edited_by, created_at)
        VALUES (${id}, ${current.title}, ${current.content ?? ""}, ${current.updated_by ?? null}, ${current.updated_at})`;
      await tx`
        DELETE FROM note_revisions WHERE note_id = ${id} AND id NOT IN (
          SELECT id FROM note_revisions WHERE note_id = ${id} ORDER BY created_at DESC, id DESC LIMIT ${MAX_REVISIONS})`;
    }

    const updated = await tx<NoteRow[]>`
      UPDATE notes SET
        title = ${patch.title ?? current.title},
        icon = ${patch.icon !== undefined ? patch.icon : current.icon},
        content = ${patch.content ?? current.content ?? ""},
        tags = ${patch.tags ?? current.tags},
        category_id = ${categoryId},
        space_user_id = ${spaceUserId},
        visibility = ${visibility},
        pinned = ${patch.pinned ?? current.pinned},
        sort_order = ${
          moved
            ? tx`(SELECT COALESCE(max(sort_order), -1) + 1 FROM notes WHERE ${noteSiblings(tx, categoryId, spaceUserId)})`
            : current.sort_order
        },
        updated_by = ${ws.viewer.actor},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *`;
    return toNote(updated[0], ws.noteAccess(updated[0]));
  });
}

/** 與同一層相鄰的項目交換順序 */
export async function moveNote(ws: Workspace, id: string, direction: "up" | "down"): Promise<void> {
  const sql = await db();
  await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const cur = await lockNoteForEdit(tx, ws, id, false);
    const siblings = await tx<{ id: string }[]>`
      SELECT id FROM notes
      WHERE deleted_at IS NULL AND ${noteSiblings(tx, cur.category_id, cur.space_user_id)}
      ORDER BY pinned DESC, sort_order, title`;
    await swapInList(tx, "notes", siblings, id, direction);
  });
}

async function swapInList(
  tx: Sql,
  table: "notes" | "categories",
  list: { id: string }[],
  id: string,
  direction: "up" | "down",
) {
  const idx = list.findIndex((x) => x.id === id);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= list.length) return;
  const reordered = [...list];
  [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
  // 重新編號，避免舊資料的 sort_order 重複造成無法交換
  for (let i = 0; i < reordered.length; i++) {
    await tx`UPDATE ${tx(table)} SET sort_order = ${i} WHERE id = ${reordered[i].id}`;
  }
}

export async function trashNote(ws: Workspace, id: string): Promise<NoteMeta> {
  const sql = await db();
  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    await lockNoteForEdit(tx, ws, id, false);
    const [row] = await tx<NoteRow[]>`
      UPDATE notes SET deleted_at = now(), updated_by = ${ws.viewer.actor} WHERE id = ${id} RETURNING *`;
    return toMeta(row, ws.noteAccess(row));
  });
}

export async function restoreNote(ws: Workspace, id: string): Promise<NoteMeta> {
  const sql = await db();
  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    await lockNoteForEdit(tx, ws, id, true);
    // 原分類若已刪除，category_id 會是 NULL（歸到所在空間的「未分類」）
    const [row] = await tx<NoteRow[]>`UPDATE notes SET deleted_at = NULL WHERE id = ${id} RETURNING *`;
    return toMeta(row, ws.noteAccess(row));
  });
}

export async function purgeNote(ws: Workspace, id: string): Promise<NoteMeta> {
  const sql = await db();
  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const row = await lockNoteForEdit(tx, ws, id, true);
    await tx`DELETE FROM notes WHERE id = ${id}`;
    return toMeta(row, ws.noteAccess(row));
  });
}

/** 清空垃圾桶：只刪除目前使用者有編輯權限的筆記 */
export async function emptyTrash(ws: Workspace): Promise<number> {
  const ids = (await listTrash(ws)).filter((n) => n.canEdit).map((n) => n.id);
  if (ids.length === 0) return 0;
  const sql = await db();
  const result = await sql`DELETE FROM notes WHERE id = ANY(${ids}::uuid[]) AND deleted_at IS NOT NULL`;
  return result.count;
}

export async function restoreRevision(ws: Workspace, noteId: string, revisionId: string): Promise<Note> {
  const sql = await db();
  const rows = await sql<{ title: string; content: string }[]>`
    SELECT title, content FROM note_revisions WHERE id = ${revisionId} AND note_id = ${noteId}`;
  if (!rows[0]) throw new HttpError(404, "找不到這個版本");
  return updateNote(ws, noteId, { title: rows[0].title, content: rows[0].content });
}

// ───────────── 分類異動 ─────────────

function requireEditableCategory(ws: Workspace, id: string): Category {
  const c = requireVisibleCategory(ws, id);
  if (!c.canEdit) throw new HttpError(403, "你沒有編輯這個分類的權限");
  return c;
}

export interface CategoryInput {
  name: string;
  icon?: string | null;
  parentId: string | null;
  spaceUserId: string | null;
  visibility?: Visibility;
}

export async function createCategory(ws: Workspace, input: CategoryInput): Promise<Category> {
  const place = placement(ws, input.parentId, input.spaceUserId);
  const visibility = input.visibility ?? defaultVisibility(place.parentVisibility, place.spaceUserId);
  const sql = await db();
  const rows = await sql<CategoryRow[]>`
    INSERT INTO categories (parent_id, name, icon, sort_order, owner_id, space_user_id, visibility)
    VALUES (${place.categoryId}, ${input.name}, ${input.icon ?? null},
      (SELECT COALESCE(max(sort_order), -1) + 1 FROM categories WHERE ${categorySiblings(sql, place.categoryId, place.spaceUserId)}),
      ${ws.subject.userId}, ${place.spaceUserId}, ${visibility})
    RETURNING ${sql(CATEGORY_COLUMNS)}`;
  return rowToCategory(ws, rows[0]);
}

/** 剛建立或修改的分類：建立者對它一定可編輯，管理權限依擁有者判斷 */
function rowToCategory(ws: Workspace, r: CategoryRow): Category {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    icon: r.icon,
    sortOrder: r.sort_order,
    ownerId: r.owner_id,
    spaceUserId: r.space_user_id,
    visibility: r.visibility as Visibility,
    canEdit: true,
    canManage: canManage(ws.subject, { ownerId: r.owner_id }),
  };
}

async function subtreeIds(sql: Sql, id: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    WITH RECURSIVE sub AS (
      SELECT id FROM categories WHERE id = ${id}
      UNION
      SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
    ) SELECT id FROM sub`;
  return rows.map((r) => r.id);
}

export interface CategoryPatch {
  name?: string;
  icon?: string | null;
  parentId?: string | null;
  /** 移到其他空間的最上層（需搭配 parentId = null） */
  spaceUserId?: string | null;
  visibility?: Visibility;
  /** 可見度一併套用到底下的分類與筆記（只會改到自己擁有的項目；管理員則全部） */
  applyToChildren?: boolean;
}

export async function updateCategory(ws: Workspace, id: string, patch: CategoryPatch): Promise<Category> {
  const current = requireEditableCategory(ws, id);
  const sql = await db();

  const targetParent = patch.parentId !== undefined ? patch.parentId : current.parentId;
  const targetSpace = targetParent ? null : patch.spaceUserId !== undefined ? patch.spaceUserId : current.spaceUserId;
  let parentId = current.parentId;
  let spaceUserId = current.spaceUserId;
  if (targetParent !== current.parentId || (!targetParent && targetSpace !== current.spaceUserId)) {
    if (targetParent && (await subtreeIds(sql, id)).includes(targetParent)) {
      throw new HttpError(400, "不能把分類移到自己或自己的子分類底下");
    }
    const place = placement(ws, targetParent, targetSpace);
    if (!current.canManage) assertOpenDestination(ws, place, current.spaceUserId);
    parentId = place.categoryId;
    spaceUserId = place.spaceUserId;
  }
  const relocated = parentId !== current.parentId || spaceUserId !== current.spaceUserId;

  const visibility = patch.visibility ?? current.visibility;
  if ((visibility !== current.visibility || patch.applyToChildren) && !current.canManage) {
    throw new HttpError(403, "只有擁有者或管理員可以變更可見度");
  }

  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const [row] = await tx<CategoryRow[]>`
      UPDATE categories SET
        name = ${patch.name ?? current.name},
        icon = ${patch.icon !== undefined ? patch.icon : current.icon},
        parent_id = ${parentId},
        space_user_id = ${spaceUserId},
        visibility = ${visibility},
        sort_order = ${
          relocated
            ? tx`(SELECT COALESCE(max(sort_order), -1) + 1 FROM categories WHERE ${categorySiblings(tx, parentId, spaceUserId)} AND id <> ${id})`
            : current.sortOrder
        },
        updated_at = now()
      WHERE id = ${id}
      RETURNING ${tx(CATEGORY_COLUMNS)}`;
    if (!row) throw new HttpError(404, "找不到分類");

    const needSubtree = spaceUserId !== current.spaceUserId || patch.applyToChildren;
    const ids = needSubtree ? await subtreeIds(tx, id) : [];
    // 換空間時，整個子樹（含垃圾桶中的筆記）一起搬過去
    if (spaceUserId !== current.spaceUserId) {
      await tx`UPDATE categories SET space_user_id = ${spaceUserId} WHERE id = ANY(${ids}::uuid[])`;
      await tx`UPDATE notes SET space_user_id = ${spaceUserId} WHERE category_id = ANY(${ids}::uuid[])`;
    }
    if (patch.applyToChildren) {
      const mine = ws.subject.isAdmin ? tx`true` : tx`owner_id = ${ws.subject.userId}`;
      await tx`UPDATE categories SET visibility = ${visibility} WHERE id = ANY(${ids}::uuid[]) AND ${mine}`;
      await tx`UPDATE notes SET visibility = ${visibility} WHERE category_id = ANY(${ids}::uuid[]) AND ${mine}`;
    }
    return rowToCategory(ws, row);
  });
}

export async function moveCategory(ws: Workspace, id: string, direction: "up" | "down"): Promise<void> {
  const cur = requireEditableCategory(ws, id);
  const sql = await db();
  await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const siblings = await tx<{ id: string }[]>`
      SELECT id FROM categories WHERE ${categorySiblings(tx, cur.parentId, cur.spaceUserId)} ORDER BY sort_order, name`;
    await swapInList(tx, "categories", siblings, id, direction);
  });
}

/** 刪除分類（含子分類）；底下的筆記會移到垃圾桶，可再還原 */
export async function deleteCategory(ws: Workspace, id: string): Promise<{ category: Category; trashed: number }> {
  const category = requireEditableCategory(ws, id);
  const sql = await db();
  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const ids = await subtreeIds(tx, id);
    // 底下有別人的內容且自己無權編輯時不允許刪除，避免刪掉別人的東西
    const blocked = ids.some((cid) => !ws.categoryById.get(cid)?.canEdit);
    const notes = await tx<NoteMetaRow[]>`
      SELECT ${tx(NOTE_META_COLUMNS)} FROM notes WHERE category_id = ANY(${ids}::uuid[]) AND deleted_at IS NULL`;
    if (blocked || notes.some((n) => !ws.noteAccess(n).canEdit)) {
      throw new HttpError(403, "這個分類底下有你沒有編輯權限的內容，無法刪除（請聯絡擁有者或管理員）");
    }
    const trashed = await tx`
      UPDATE notes SET deleted_at = now(), updated_by = ${ws.viewer.actor}
      WHERE category_id = ANY(${ids}::uuid[]) AND deleted_at IS NULL`;
    await tx`DELETE FROM categories WHERE id = ${id}`;
    return { category, trashed: trashed.count };
  });
}

// ───────────── 匯入／匯出 ─────────────

export interface ImportCategoryInput {
  key: string;
  parentKey: string | null;
  name: string;
}

/** 依序建立分類（父分類必須排在子分類前面），回傳 key → 實際 id */
export async function importCategories(
  ws: Workspace,
  parentId: string | null,
  spaceUserId: string | null,
  list: ImportCategoryInput[],
): Promise<Record<string, string>> {
  const place = placement(ws, parentId, spaceUserId);
  const visibility = defaultVisibility(place.parentVisibility, place.spaceUserId);
  const sql = await db();
  return sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const map: Record<string, string> = {};
    for (const c of list) {
      const parent = c.parentKey ? map[c.parentKey] : place.categoryId;
      if (c.parentKey && !parent) throw new HttpError(400, `分類順序錯誤：${c.name}`);
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO categories (parent_id, name, icon, sort_order, owner_id, space_user_id, visibility)
        VALUES (${parent ?? null}, ${c.name}, ${"📄"},
          (SELECT COALESCE(max(sort_order), -1) + 1 FROM categories WHERE ${categorySiblings(tx, parent ?? null, place.spaceUserId)}),
          ${ws.subject.userId}, ${place.spaceUserId}, ${visibility})
        RETURNING id`;
      map[c.key] = row.id;
    }
    return map;
  });
}

export interface ImportNoteInput {
  categoryId: string;
  title: string;
  content: string;
  tags: string[];
}

export async function importNotes(ws: Workspace, list: ImportNoteInput[]): Promise<number> {
  const places = new Map<string, Placement>();
  for (const id of new Set(list.map((n) => n.categoryId))) places.set(id, placement(ws, id, null));
  const actor = ws.viewer.actor;
  const sql = await db();
  await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    for (const n of list) {
      const place = places.get(n.categoryId)!;
      await tx`
        INSERT INTO notes (category_id, title, content, tags, sort_order, created_by, updated_by, owner_id, space_user_id, visibility)
        VALUES (${n.categoryId}, ${n.title}, ${n.content}, ${n.tags},
          (SELECT COALESCE(max(sort_order), -1) + 1 FROM notes WHERE category_id = ${n.categoryId}),
          ${actor}, ${actor}, ${ws.subject.userId}, ${place.spaceUserId},
          ${defaultVisibility(place.parentVisibility, place.spaceUserId)})`;
    }
  });
  return list.length;
}

export interface ExportNote {
  id: string;
  categoryId: string | null;
  spaceUserId: string | null;
  title: string;
  icon: string | null;
  tags: string[];
  content: string;
  updatedAt: string;
}

/** 匯出資料：指定分類（含子分類）或全部看得到的內容；筆記分頁取得，避免單次回應過大 */
export async function exportData(
  ws: Workspace,
  categoryId: string | null,
  offset: number,
  limit: number,
): Promise<{ categories: Category[]; notes: ExportNote[]; total: number }> {
  let categories = ws.tree.categories;
  let noteIds = ws.visibleNoteIds;
  if (categoryId) {
    requireVisibleCategory(ws, categoryId);
    const ids = treeDescendants(ws.tree.categories, categoryId);
    categories = categories.filter((c) => ids.has(c.id));
    noteIds = ws.tree.notes.filter((n) => n.categoryId && ids.has(n.categoryId)).map((n) => n.id);
  }
  const sql = await db();
  const rows = noteIds.length
    ? await sql<NoteRow[]>`
        SELECT * FROM notes WHERE id = ANY(${noteIds}::uuid[])
        ORDER BY category_id NULLS FIRST, pinned DESC, sort_order, title
        LIMIT ${limit} OFFSET ${offset}`
    : [];
  return {
    categories,
    total: noteIds.length,
    notes: rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      spaceUserId: r.space_user_id,
      title: r.title,
      icon: r.icon,
      tags: r.tags ?? [],
      content: r.content ?? "",
      updatedAt: r.updated_at.toISOString(),
    })),
  };
}
