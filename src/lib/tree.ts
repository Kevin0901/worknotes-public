// 分類樹的工具函式（前後端皆可使用）
import type { Category, NoteMeta, Space, Tree } from "./types";

export const UNCATEGORIZED = "uncategorized";

export function childrenMap(categories: Category[]): Map<string | null, Category[]> {
  const map = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant"));
  }
  return map;
}

export function notesByCategory(notes: NoteMeta[]): Map<string | null, NoteMeta[]> {
  const map = new Map<string | null, NoteMeta[]>();
  for (const n of notes) {
    const key = n.categoryId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  return map;
}

/** 從根到指定分類的路徑（含自己） */
export function categoryPath(categories: Category[], id: string | null): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let cur = id ? byId.get(id) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export function descendantIds(categories: Category[], id: string): Set<string> {
  const kids = childrenMap(categories);
  const result = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of kids.get(cur) ?? []) {
      if (!result.has(c.id)) {
        result.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return result;
}

export function countNotesDeep(tree: Tree, id: string): number {
  const ids = descendantIds(tree.categories, id);
  return tree.notes.filter((n) => n.categoryId && ids.has(n.categoryId)).length;
}

/** 下拉選單用：依樹狀順序攤平，附縮排層級 */
export function flattenCategories(categories: Category[], exclude?: Set<string>): { category: Category; depth: number }[] {
  const kids = childrenMap(categories);
  const out: { category: Category; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of kids.get(parent) ?? []) {
      if (exclude?.has(c.id)) continue;
      out.push({ category: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function categoryLabel(categories: Category[], id: string | null): string {
  if (!id) return "未分類";
  return categoryPath(categories, id).map((c) => c.name).join(" / ") || "未分類";
}

/** 空間的 key：公共區為 "public"，個人空間為使用者 id */
export const spaceKey = (spaceUserId: string | null) => spaceUserId ?? "public";

/** 某個空間的「未分類」頁面網址 */
export function uncategorizedHref(spaceUserId: string | null): string {
  return spaceUserId ? `/c/${UNCATEGORIZED}?space=${spaceUserId}` : `/c/${UNCATEGORIZED}`;
}

/** 某個空間最上層的分類 */
export function spaceRoots(categories: Category[], spaceUserId: string | null): Category[] {
  return (childrenMap(categories).get(null) ?? []).filter((c) => c.spaceUserId === spaceUserId);
}

export function spaceOf(tree: Tree, spaceUserId: string | null): Space | undefined {
  return tree.spaces.find((s) => s.userId === spaceUserId);
}

export function spaceLabel(tree: Tree, spaceUserId: string | null): string {
  return spaceOf(tree, spaceUserId)?.name ?? (spaceUserId ? "個人空間" : "公共區");
}

/** 「空間 / 分類 / 子分類」；只有一個空間時省略空間名稱 */
export function locationLabel(tree: Tree, item: { spaceUserId: string | null; categoryId: string | null }): string {
  const cat = categoryLabel(tree.categories, item.categoryId);
  return tree.spaces.length > 1 ? `${spaceLabel(tree, item.spaceUserId)} / ${cat}` : cat;
}
