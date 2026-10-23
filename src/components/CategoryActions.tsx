"use client";

import { useRouter } from "next/navigation";
import { Download, Ellipsis, FilePlus, FolderInput, FolderPlus, Pencil, Share2, Trash2 } from "lucide-react";
import type { Category } from "@/lib/types";
import { DropdownMenu, type MenuItem } from "./DropdownMenu";
import { useWorkspaceActions } from "./workspace";

/** 分類頁右上角的操作；category 為 null 時是某個空間的「未分類」 */
export function CategoryActions({
  category,
  spaceUserId,
  canCreate,
}: {
  category: Category | null;
  spaceUserId: string | null;
  canCreate: boolean;
}) {
  const actions = useWorkspaceActions();
  const router = useRouter();
  const items: MenuItem[] = [];
  if (category?.canEdit) {
    items.push(
      { label: "新增子分類", icon: <FolderPlus size={15} />, onSelect: () => actions.createCategory(category.id) },
      { label: "重新命名／圖示", icon: <Pencil size={15} />, onSelect: () => actions.editCategory(category) },
    );
    if (category.canManage) {
      items.push({ label: "分享與權限", icon: <Share2 size={15} />, onSelect: () => actions.shareCategory(category) });
    }
    items.push({ label: "移動到…", icon: <FolderInput size={15} />, onSelect: () => actions.moveCategoryTo(category) });
  }
  if (category) {
    items.push({ label: "匯出此分類（ZIP）", icon: <Download size={15} />, onSelect: () => router.push(`/transfer?category=${category.id}`) });
  }
  if (category?.canEdit) {
    items.push(
      { label: "", onSelect: () => {}, divider: true },
      { label: "刪除分類", icon: <Trash2 size={15} />, danger: true, onSelect: () => actions.deleteCategory(category) },
    );
  }
  const canAddNote = category ? category.canEdit : canCreate;

  return (
    <div className="flex shrink-0 items-center gap-1.5 pt-1">
      {canAddNote && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => (category ? actions.createNote(category.id) : actions.createNote(null, spaceUserId))}
        >
          <FilePlus size={15} /> 新增筆記
        </button>
      )}
      {items.length > 0 && (
        <DropdownMenu label="分類操作" align="right" trigger={<Ellipsis size={18} />} triggerClassName="icon-btn h-8 w-8" items={items} />
      )}
    </div>
  );
}
