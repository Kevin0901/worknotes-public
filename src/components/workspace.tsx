"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { defaultVisibility, LEVEL, VISIBILITY_LABELS, type Visibility } from "@/lib/access";
import { api, errorMessage } from "@/lib/client-api";
import { categoryPath, countNotesDeep, descendantIds, flattenCategories, spaceKey, uncategorizedHref } from "@/lib/tree";
import type { Category, NoteMeta, Tree, ViewerInfo } from "@/lib/types";
import { useDialogs, useToast, type FormOption } from "./Providers";
import { inheritedLimit, visibilityField } from "./Visibility";

interface WorkspaceValue {
  tree: Tree;
  viewer: ViewerInfo;
  siteTitle: string;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceValue; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace 必須在 WorkspaceProvider 內使用");
  return ctx;
}

/** 位置選項的值：「s:空間」代表空間最上層，「c:分類 id」代表放在分類底下 */
type Location = { categoryId: string | null; space: string };

function parseLocation(value: string): Location | null {
  if (value.startsWith("s:")) return { categoryId: null, space: value.slice(2) };
  if (value.startsWith("c:")) return { categoryId: value.slice(2), space: "" };
  return null;
}

const locationValue = (categoryId: string | null, spaceUserId: string | null) =>
  categoryId ? `c:${categoryId}` : `s:${spaceKey(spaceUserId)}`;

/**
 * 移動／新增時的位置清單：每個空間的最上層 + 其中的分類（依樹狀縮排）。
 * 不能放的地方會顯示但停用，方便看出結構。
 */
function locationOptions(
  tree: Tree,
  { exclude, onlySpace, rootLabel = "最上層" }: { exclude?: Set<string>; onlySpace?: string | null; rootLabel?: string } = {},
): FormOption[] {
  const out: FormOption[] = [];
  for (const space of tree.spaces) {
    if (onlySpace !== undefined && space.userId !== onlySpace) continue;
    const cats = tree.categories.filter((c) => c.spaceUserId === space.userId);
    if (!space.canCreate && !cats.some((c) => c.canEdit)) continue;
    out.push({
      value: `s:${space.key}`,
      label: `${space.userId ? "👤" : "🌐"} ${space.name}（${rootLabel}）`,
      disabled: !space.canCreate,
    });
    for (const { category, depth } of flattenCategories(cats, exclude)) {
      out.push({
        value: `c:${category.id}`,
        label: `${"　".repeat(depth + 1)}${category.icon ? category.icon + " " : ""}${category.name}`,
        disabled: !category.canEdit,
      });
    }
  }
  return out;
}

/** 新增分類／筆記時預設放的空間：有個人空間就放自己的，否則公共區 */
function defaultSpace(tree: Tree): string {
  return tree.spaces.find((s) => s.isMine)?.key ?? "public";
}

function shareHint(tree: Tree, parentId: string | null): string | undefined {
  const limit = inheritedLimit(tree, parentId);
  if (!limit || limit === "edit") return undefined;
  return `上層分類設定為「${VISIBILITY_LABELS[limit]}」，實際權限不會比它更開放。`;
}

/** 新增／修改／刪除／分類等操作（側邊欄、分類頁、筆記頁共用） */
export function useWorkspaceActions() {
  const { tree } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const dialogs = useDialogs();
  const toast = useToast();

  const run = useCallback(
    async (fn: () => Promise<void>, success?: string) => {
      try {
        await fn();
        if (success) toast(success);
        router.refresh();
      } catch (err) {
        toast(errorMessage(err), "error");
      }
    },
    [router, toast],
  );

  return useMemo(() => {
    const byId = new Map(tree.categories.map((c) => [c.id, c]));

    const createNoteAt = (categoryId: string | null, space: string) =>
      run(async () => {
        const res = await api<{ note: NoteMeta }>("POST", "/api/notes", { categoryId, space, title: "未命名筆記" });
        router.push(`/n/${res.note.id}?edit=1`);
      });

    return {
      /**
       * 新增分類。spaceUserId 為 undefined 時（例如首頁按鈕）讓使用者選擇空間，
       * 可見度則依空間預設（我的空間：僅自己可見；公共區：他人可看可編輯）。
       */
      async createCategory(parentId: string | null, spaceUserId?: string | null) {
        const parent = parentId ? byId.get(parentId) : undefined;
        const askSpace = !parent && spaceUserId === undefined;
        const space = parent ? parent.spaceUserId : spaceUserId ?? null;
        const spaceOptions = tree.spaces
          .filter((s) => s.canCreate)
          .map((s) => ({ value: s.key, label: `${s.userId ? "👤" : "🌐"} ${s.name}` }));
        const v = await dialogs.form({
          title: parent ? `在「${parent.name}」新增子分類` : "新增分類",
          fields: [
            { name: "name", label: "分類名稱", required: true, maxLength: 80, placeholder: "例如：網路設備" },
            { name: "icon", label: "圖示", type: "emoji", defaultValue: "📁" },
            ...(askSpace
              ? [{
                  name: "space",
                  label: "放在",
                  type: "select" as const,
                  defaultValue: defaultSpace(tree),
                  options: spaceOptions,
                  hint: "我的空間預設「僅自己可見」，公共區預設「他人可看可編輯」，之後可在「分享與權限」調整。",
                }]
              : [visibilityField(defaultVisibility(parent?.visibility ?? null, space), shareHint(tree, parentId))]),
          ],
          submitLabel: "建立",
        });
        if (!v) return;
        await run(async () => {
          const res = await api<{ category: Category }>("POST", "/api/categories", {
            name: v.name,
            icon: v.icon,
            parentId,
            space: askSpace ? v.space : spaceKey(space),
            visibility: askSpace ? undefined : v.visibility,
          });
          router.push(`/c/${res.category.id}`);
        }, "已建立分類");
      },

      /** 新增筆記（立即建立並進入編輯）；沒有指定位置時先詢問要放哪裡 */
      async createNote(categoryId: string | null, spaceUserId?: string | null) {
        if (categoryId || spaceUserId !== undefined) {
          return createNoteAt(categoryId, spaceKey(categoryId ? null : spaceUserId ?? null));
        }
        const v = await dialogs.form({
          title: "新增筆記",
          fields: [
            {
              name: "location",
              label: "放在",
              type: "select",
              defaultValue: `s:${defaultSpace(tree)}`,
              options: locationOptions(tree, { rootLabel: "未分類" }),
              hint: "筆記的可見度預設與所在分類相同；直接放在空間最上層時，我的空間為「僅自己可見」、公共區為「他人可看可編輯」。",
            },
          ],
          submitLabel: "建立",
        });
        const loc = v && parseLocation(v.location);
        if (!loc) return;
        await createNoteAt(loc.categoryId, loc.categoryId ? "public" : loc.space);
      },

      async editCategory(cat: Category) {
        const v = await dialogs.form({
          title: "編輯分類",
          fields: [
            { name: "name", label: "分類名稱", required: true, maxLength: 80, defaultValue: cat.name },
            { name: "icon", label: "圖示", type: "emoji", defaultValue: cat.icon ?? "" },
          ],
          submitLabel: "儲存",
        });
        if (!v) return;
        await run(() => api("PATCH", `/api/categories/${cat.id}`, { name: v.name, icon: v.icon || null }).then(() => {}), "已更新分類");
      },

      async shareCategory(cat: Category) {
        const v = await dialogs.form({
          title: `分享與權限：${cat.name}`,
          fields: [
            visibilityField(cat.visibility, shareHint(tree, cat.parentId)),
            {
              name: "apply",
              label: "同時套用到底下的子分類與筆記",
              type: "checkbox",
              hint: "只會變更你擁有的項目。不勾選時，子項目保留各自的設定（但不會比這個分類更開放）。",
            },
          ],
          submitLabel: "儲存",
        });
        if (!v) return;
        await run(
          () =>
            api("PATCH", `/api/categories/${cat.id}`, { visibility: v.visibility, applyToChildren: v.apply === "1" }).then(() => {}),
          "已更新權限",
        );
      },

      async moveCategoryTo(cat: Category) {
        const v = await dialogs.form({
          title: `移動「${cat.name}」`,
          fields: [
            {
              name: "location",
              label: "移到",
              type: "select",
              defaultValue: locationValue(cat.parentId, cat.spaceUserId),
              options: locationOptions(tree, {
                exclude: descendantIds(tree.categories, cat.id),
                onlySpace: cat.canManage ? undefined : cat.spaceUserId,
              }),
              hint: cat.canManage
                ? "移到其他空間時，底下的子分類與筆記會一起移過去。"
                : "這個分類不是你建立的，只能在同一個空間內移動。",
            },
          ],
          submitLabel: "移動",
        });
        const loc = v && parseLocation(v.location);
        if (!loc) return;
        const body = loc.categoryId ? { parentId: loc.categoryId } : { parentId: null, space: loc.space };
        await run(() => api("PATCH", `/api/categories/${cat.id}`, body).then(() => {}), "已移動分類");
      },

      async reorderCategory(cat: Category, move: "up" | "down") {
        await run(() => api("PATCH", `/api/categories/${cat.id}`, { move }).then(() => {}));
      },

      async deleteCategory(cat: Category) {
        const count = countNotesDeep(tree, cat.id);
        const subCount = descendantIds(tree.categories, cat.id).size - 1;
        const ok = await dialogs.confirm({
          title: `刪除分類「${cat.name}」？`,
          message: (
            <>
              {subCount > 0 && <>會一併刪除 {subCount} 個子分類。</>}
              {count > 0 ? (
                <>底下 {count} 篇筆記會移到「垃圾桶」，之後仍可還原（還原後歸到所在空間的「未分類」）。</>
              ) : (
                <>此分類沒有筆記。</>
              )}
            </>
          ),
          confirmLabel: "刪除",
          danger: true,
        });
        if (!ok) return;
        await run(async () => {
          await api("DELETE", `/api/categories/${cat.id}`);
          if (pathname.startsWith(`/c/${cat.id}`)) router.push(cat.parentId ? `/c/${cat.parentId}` : "/");
        }, "已刪除分類");
      },

      async renameNote(note: NoteMeta) {
        const v = await dialogs.form({
          title: "重新命名筆記",
          fields: [
            { name: "title", label: "標題", required: true, maxLength: 200, defaultValue: note.title },
            { name: "icon", label: "圖示", type: "emoji", defaultValue: note.icon ?? "" },
          ],
          submitLabel: "儲存",
        });
        if (!v) return;
        await run(() => api("PATCH", `/api/notes/${note.id}`, { title: v.title, icon: v.icon || null }).then(() => {}), "已更新");
      },

      async shareNote(note: NoteMeta) {
        const v = await dialogs.form({
          title: `分享與權限：${note.title}`,
          fields: [visibilityField(note.visibility, shareHint(tree, note.categoryId))],
          submitLabel: "儲存",
        });
        if (!v) return;
        await run(() => api("PATCH", `/api/notes/${note.id}`, { visibility: v.visibility }).then(() => {}), "已更新權限");
      },

      async moveNoteTo(note: NoteMeta) {
        const v = await dialogs.form({
          title: `移動「${note.title}」`,
          fields: [
            {
              name: "location",
              label: "移到",
              type: "select",
              defaultValue: locationValue(note.categoryId, note.spaceUserId),
              options: locationOptions(tree, { rootLabel: "未分類", onlySpace: note.canManage ? undefined : note.spaceUserId }),
              hint: note.canManage ? undefined : "這篇筆記不是你建立的，只能在同一個空間內移動。",
            },
          ],
          submitLabel: "移動",
        });
        const loc = v && parseLocation(v.location);
        if (!loc) return;
        const body = loc.categoryId ? { categoryId: loc.categoryId } : { categoryId: null, space: loc.space };
        await run(() => api("PATCH", `/api/notes/${note.id}`, body).then(() => {}), "已移動筆記");
      },

      async reorderNote(note: NoteMeta, move: "up" | "down") {
        await run(() => api("PATCH", `/api/notes/${note.id}`, { move }).then(() => {}));
      },

      async togglePin(note: NoteMeta) {
        await run(
          () => api("PATCH", `/api/notes/${note.id}`, { pinned: !note.pinned }).then(() => {}),
          note.pinned ? "已取消釘選" : "已釘選",
        );
      },

      async trashNote(note: NoteMeta) {
        const ok = await dialogs.confirm({
          title: `將「${note.title}」移到垃圾桶？`,
          message: "可在「垃圾桶」中還原。",
          confirmLabel: "移到垃圾桶",
          danger: true,
        });
        if (!ok) return;
        await run(async () => {
          await api("DELETE", `/api/notes/${note.id}`);
          if (pathname.startsWith(`/n/${note.id}`)) {
            router.push(note.categoryId ? `/c/${note.categoryId}` : uncategorizedHref(note.spaceUserId));
          }
        }, "已移到垃圾桶");
      },

      async setSpaceHidden(hidden: boolean) {
        const ok = await dialogs.confirm({
          title: hidden ? "對其他人隱藏我的空間？" : "公開我的空間？",
          message: hidden
            ? "隱藏後，其他使用者完全看不到你的空間（包含設為「他人可看」的內容）；管理員仍看得到。你在公共區的內容不受影響。"
            : "公開後，其他使用者可以看到你空間中設為「他人可看」或「他人可看可編輯」的內容；「僅自己可見」的內容仍然只有你看得到。",
          confirmLabel: hidden ? "隱藏" : "公開",
        });
        if (!ok) return;
        await run(() => api("PATCH", "/api/account/space", { hidden }).then(() => {}), hidden ? "已隱藏我的空間" : "已公開我的空間");
      },
    };
  }, [dialogs, pathname, router, run, tree]);
}

/** 項目的可見度是否和上層（或空間預設）不同，用來決定側邊欄要不要顯示圖示 */
export function visibilityChanged(tree: Tree, item: { visibility: Visibility; spaceUserId: string | null }, parentId: string | null) {
  const parent = parentId ? categoryPath(tree.categories, parentId).at(-1) : undefined;
  const base: Visibility = parent ? parent.visibility : item.spaceUserId ? "private" : "edit";
  return LEVEL[item.visibility] !== LEVEL[base];
}
