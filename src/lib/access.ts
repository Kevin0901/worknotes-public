// 筆記／分類的存取權限規則（純函式，前後端與測試皆可使用）
//
// 規則：
// 1. 每個分類、筆記都有擁有者（ownerId）、所在空間（spaceUserId：null = 公共區）與可見度（visibility）。
// 2. 有效權限 = 從空間 → 各層上層分類 → 項目本身，取「最嚴格」的那一個。
// 3. 擁有者對自己擁有的節點一律視為「可編輯」。
// 4. 某人把自己的空間設為隱藏時，其他人看不到該空間的任何內容。
// 5. 管理員可看、可改所有內容；角色為「僅檢視」的帳號永遠不能編輯。

export type Visibility = "private" | "read" | "edit";

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: "僅自己可見",
  read: "他人可看",
  edit: "他人可看可編輯",
};

export const LEVEL: Record<Visibility, number> = { private: 0, read: 1, edit: 2 };

export interface AccessSubject {
  userId: string | null;
  isAdmin: boolean;
  /** 帳號角色允許編輯（editor 或管理員） */
  canEditRole: boolean;
}

export interface AccessNode {
  id: string;
  parentId?: string | null; // 分類用
  categoryId?: string | null; // 筆記用
  ownerId: string | null;
  spaceUserId: string | null;
  visibility: Visibility;
}

export interface AccessContext {
  categories: Map<string, AccessNode>;
  hiddenSpaces: Set<string>;
}

export function isVisibility(v: unknown): v is Visibility {
  return v === "private" || v === "read" || v === "edit";
}

function ownLevel(s: AccessSubject, node: AccessNode): number {
  if (s.userId && node.ownerId === s.userId) return 2;
  return LEVEL[node.visibility] ?? 0;
}

function spaceGate(s: AccessSubject, node: AccessNode, ctx: AccessContext): number {
  if (!node.spaceUserId || node.spaceUserId === s.userId) return 2;
  return ctx.hiddenSpaces.has(node.spaceUserId) ? 0 : 2;
}

/** 分類的有效權限等級（0 不可見、1 可看、2 可編輯；未考慮帳號角色） */
export function categoryLevel(s: AccessSubject, id: string, ctx: AccessContext, memo = new Map<string, number>()): number {
  if (s.isAdmin) return 2;
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const node = ctx.categories.get(id);
  if (!node) return 0;
  memo.set(id, 0); // 防止資料異常造成循環
  let level = Math.min(ownLevel(s, node), spaceGate(s, node, ctx));
  if (node.parentId) level = Math.min(level, categoryLevel(s, node.parentId, ctx, memo));
  memo.set(id, level);
  return level;
}

export function noteLevel(s: AccessSubject, note: AccessNode, ctx: AccessContext, memo?: Map<string, number>): number {
  if (s.isAdmin) return 2;
  let level = Math.min(ownLevel(s, note), spaceGate(s, note, ctx));
  if (note.categoryId && ctx.categories.has(note.categoryId)) {
    level = Math.min(level, categoryLevel(s, note.categoryId, ctx, memo));
  }
  return level;
}

export const canViewLevel = (level: number) => level >= 1;
export const canEditLevel = (s: AccessSubject, level: number) => s.canEditRole && level >= 2;

/** 可以變更可見度、移動到其他空間的人：擁有者或管理員 */
export function canManage(s: AccessSubject, node: { ownerId: string | null }): boolean {
  return s.isAdmin || (!!s.userId && node.ownerId === s.userId && s.canEditRole);
}

/** 能否在某個空間的最上層新增分類／筆記 */
export function canCreateInSpace(s: AccessSubject, spaceUserId: string | null): boolean {
  if (!s.canEditRole) return false;
  if (s.isAdmin) return true;
  return spaceUserId === null || spaceUserId === s.userId;
}

/** 新項目的預設可見度：沿用上層；最上層時，個人空間預設僅自己、公共區預設可編輯 */
export function defaultVisibility(parentVisibility: Visibility | null, spaceUserId: string | null): Visibility {
  if (parentVisibility) return parentVisibility;
  return spaceUserId ? "private" : "edit";
}
