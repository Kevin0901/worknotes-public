import "server-only";
import { cache } from "react";
import {
  canCreateInSpace, canEditLevel, canManage, categoryLevel, isVisibility, noteLevel,
  type AccessContext, type AccessNode, type AccessSubject,
} from "./access";
import { getViewer, type Viewer } from "./auth";
import { db } from "./db";
import { HttpError, isUuid } from "./http";
import type { Category, GuideMeta, NoteMeta, Space, Tree, Visibility } from "./types";

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  owner_id: string | null;
  space_user_id: string | null;
  visibility: string;
}

export interface NoteAccessRow {
  id: string;
  category_id: string | null;
  owner_id: string | null;
  space_user_id: string | null;
  visibility: string;
}

export interface NoteMetaRow extends NoteAccessRow {
  title: string;
  icon: string | null;
  tags: string[];
  pinned: boolean;
  sort_order: number;
  updated_at: Date;
}

interface GuideRow {
  slug: string;
  title: string;
  icon: string | null;
  owner_id: string | null;
  space_user_id: string | null;
  visibility: string;
  sort_order: number;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  space_hidden: boolean;
}

export const CATEGORY_COLUMNS = ["id", "parent_id", "name", "icon", "sort_order", "owner_id", "space_user_id", "visibility"];
export const NOTE_META_COLUMNS = [
  "id", "category_id", "title", "icon", "tags", "pinned", "sort_order", "updated_at", "owner_id", "space_user_id", "visibility",
];

const vis = (v: string): Visibility => (isVisibility(v) ? v : "private");

export function categoryNode(r: CategoryRow): AccessNode {
  return { id: r.id, parentId: r.parent_id, ownerId: r.owner_id, spaceUserId: r.space_user_id, visibility: vis(r.visibility) };
}

export function noteNode(r: NoteAccessRow): AccessNode {
  return { id: r.id, categoryId: r.category_id, ownerId: r.owner_id, spaceUserId: r.space_user_id, visibility: vis(r.visibility) };
}

export interface ItemAccess {
  level: number;
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
}

export interface Workspace {
  viewer: Viewer;
  subject: AccessSubject;
  ctx: AccessContext;
  tree: Tree;
  /** 目前使用者看得到的分類 */
  categoryById: Map<string, Category>;
  /** 目前使用者看得到的筆記（不含垃圾桶） */
  noteById: Map<string, NoteMeta>;
  visibleNoteIds: string[];
  noteAccess(row: NoteAccessRow): ItemAccess;
  /** 目前使用者看得到的互動教學頁（看不到時為 undefined） */
  guide(slug: string): GuideMeta | undefined;
  /** 分類對「任何人」都是可編輯（公開編輯）；非擁有者只能把項目移到這種地方 */
  isOpenCategory(id: string): boolean;
  /** 個人空間名稱 */
  spaceName(spaceUserId: string | null): string;
}

export function subjectOf(v: Viewer): AccessSubject {
  return { userId: v.user?.id ?? null, isAdmin: !!v.admin, canEditRole: v.canEdit };
}

/** 用來判斷「對任何其他人」的權限 */
const NOBODY: AccessSubject = { userId: null, isAdmin: false, canEditRole: true };

const displayName = (u: UserRow) => u.name || u.email.split("@")[0];

/** 載入目前使用者可見的工作區（每個請求只計算一次） */
export const loadWorkspace = cache(async (): Promise<Workspace> => {
  const viewer = await getViewer();
  const subject = subjectOf(viewer);
  const sql = await db();
  const [catRows, noteRows, guideRows, users] = await Promise.all([
    sql<CategoryRow[]>`SELECT ${sql(CATEGORY_COLUMNS)} FROM categories ORDER BY sort_order, name`,
    sql<NoteMetaRow[]>`
      SELECT ${sql(NOTE_META_COLUMNS)} FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order, title`,
    sql<GuideRow[]>`
      SELECT slug, title, icon, owner_id, space_user_id, visibility, sort_order FROM guide_pages ORDER BY sort_order, title`,
    sql<UserRow[]>`SELECT id, name, email, space_hidden FROM app_users`,
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const ctx: AccessContext = {
    categories: new Map(catRows.map((r) => [r.id, categoryNode(r)])),
    hiddenSpaces: new Set(users.filter((u) => u.space_hidden).map((u) => u.id)),
  };
  const memo = new Map<string, number>();
  const openMemo = new Map<string, number>();

  const categories: Category[] = [];
  for (const r of catRows) {
    const level = categoryLevel(subject, r.id, ctx, memo);
    if (level < 1) continue;
    const node = ctx.categories.get(r.id)!;
    categories.push({
      id: r.id,
      parentId: r.parent_id,
      name: r.name,
      icon: r.icon,
      sortOrder: r.sort_order,
      ownerId: r.owner_id,
      spaceUserId: r.space_user_id,
      visibility: node.visibility,
      canEdit: canEditLevel(subject, level),
      canManage: canManage(subject, node),
    });
  }

  const notes: NoteMeta[] = [];
  for (const r of noteRows) {
    const node = noteNode(r);
    const level = noteLevel(subject, node, ctx, memo);
    if (level < 1) continue;
    notes.push({
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
      visibility: node.visibility,
      canEdit: canEditLevel(subject, level),
      canManage: canManage(subject, node),
    });
  }

  // 互動教學頁：與筆記相同的規則（空間 → 本身可見度；擁有者一律可看），內容不在資料庫所以沒有「可編輯」
  const guides: GuideMeta[] = [];
  for (const r of guideRows) {
    const node: AccessNode = { id: r.slug, ownerId: r.owner_id, spaceUserId: r.space_user_id, visibility: vis(r.visibility) };
    const level = noteLevel(subject, node, ctx, memo);
    if (level < 1) continue;
    guides.push({
      slug: r.slug,
      title: r.title,
      icon: r.icon,
      href: `/guides/${r.slug}`,
      ownerId: r.owner_id,
      spaceUserId: r.space_user_id,
      visibility: node.visibility,
      canEdit: false,
      canManage: canManage(subject, node),
    });
  }

  // 第一層空間：公共區、我的空間、其他人有可見內容的空間
  const spaceIds = new Set<string>();
  for (const x of [...categories, ...notes, ...guides]) if (x.spaceUserId) spaceIds.add(x.spaceUserId);
  const me = subject.userId ? userById.get(subject.userId) : undefined;
  const spaces: Space[] = [
    { key: "public", userId: null, name: "公共區", isMine: false, hidden: false, canCreate: canCreateInSpace(subject, null) },
  ];
  if (me) {
    spaces.push({ key: me.id, userId: me.id, name: "我的空間", isMine: true, hidden: me.space_hidden, canCreate: canCreateInSpace(subject, me.id) });
  }
  const others = [...spaceIds]
    .filter((id) => id !== subject.userId)
    .map((id) => userById.get(id))
    .filter((u): u is UserRow => !!u)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "zh-Hant"));
  for (const u of others) {
    spaces.push({
      key: u.id,
      userId: u.id,
      name: `${displayName(u)} 的空間`,
      isMine: false,
      hidden: u.space_hidden,
      canCreate: canCreateInSpace(subject, u.id),
    });
  }

  const owners: Record<string, string> = {};
  for (const x of [...categories, ...notes]) {
    if (x.ownerId && !owners[x.ownerId]) {
      const u = userById.get(x.ownerId);
      if (u) owners[x.ownerId] = displayName(u);
    }
  }

  return {
    viewer,
    subject,
    ctx,
    tree: { categories, notes, guides, spaces, owners },
    categoryById: new Map(categories.map((c) => [c.id, c])),
    noteById: new Map(notes.map((n) => [n.id, n])),
    visibleNoteIds: notes.map((n) => n.id),
    noteAccess(row) {
      const node = noteNode(row);
      const level = noteLevel(subject, node, ctx, memo);
      return { level, canView: level >= 1, canEdit: canEditLevel(subject, level), canManage: canManage(subject, node) };
    },
    guide(slug) {
      return guides.find((g) => g.slug === slug);
    },
    isOpenCategory(id) {
      return categoryLevel(NOBODY, id, ctx, openMemo) >= 2;
    },
    spaceName(spaceUserId) {
      if (!spaceUserId) return "公共區";
      if (spaceUserId === subject.userId) return "我的空間";
      const u = userById.get(spaceUserId);
      return u ? `${displayName(u)} 的空間` : "（已刪除的使用者）";
    },
  };
});

/**
 * 解析 API 傳入的空間：「public」→ 公共區、「mine」→ 自己的空間；
 * 管理員也可以直接指定某位使用者的 id。
 */
export function resolveSpace(ws: Workspace, value: unknown): string | null {
  if (value === undefined || value === null || value === "public") return null;
  if (value === "mine") {
    if (!ws.subject.userId) throw new HttpError(400, "管理員帳號沒有個人空間，請改用 Google 帳號登入");
    return ws.subject.userId;
  }
  if (isUuid(value) && (value === ws.subject.userId || ws.subject.isAdmin)) return value;
  throw new HttpError(400, "空間參數錯誤");
}

export function requireVisibleCategory(ws: Workspace, id: string): Category {
  const c = ws.categoryById.get(id);
  if (!c) throw new HttpError(404, "找不到分類");
  return c;
}
