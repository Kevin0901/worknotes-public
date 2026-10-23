"use client";

import { LEVEL, VISIBILITY_LABELS } from "@/lib/access";
import { spaceLabel } from "@/lib/tree";
import type { AccessInfo } from "@/lib/types";
import { inheritedLimit, VISIBILITY_HINTS, VisibilityIcon } from "./Visibility";
import { useWorkspace } from "./workspace";

/** 分類頁、筆記頁標題下方的權限標籤：實際可見度、所在空間、擁有者 */
export function AccessBadge({ item, parentId }: { item: AccessInfo; parentId: string | null }) {
  const { tree } = useWorkspace();
  const limit = inheritedLimit(tree, parentId);
  const limited = !!limit && LEVEL[limit] < LEVEL[item.visibility];
  const effective = limited ? limit : item.visibility;
  const owner = item.ownerId ? tree.owners[item.ownerId] : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        className="chip"
        title={limited ? `本身設定為「${VISIBILITY_LABELS[item.visibility]}」，但受上層分類限制` : VISIBILITY_HINTS[effective]}
      >
        <VisibilityIcon visibility={effective} size={11} />
        {VISIBILITY_LABELS[effective]}
      </span>
      <span>{spaceLabel(tree, item.spaceUserId)}</span>
      {owner && <span>擁有者 {owner}</span>}
    </span>
  );
}
