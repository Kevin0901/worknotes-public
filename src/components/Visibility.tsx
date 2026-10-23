"use client";

import { Eye, Lock, Users } from "lucide-react";
import { LEVEL, VISIBILITY_LABELS, type Visibility } from "@/lib/access";
import { categoryPath } from "@/lib/tree";
import type { Tree } from "@/lib/types";
import type { FormField } from "./Providers";

export const VISIBILITY_HINTS: Record<Visibility, string> = {
  private: "只有擁有者本人（與管理員）看得到",
  read: "其他使用者可以查看，但不能修改",
  edit: "其他可編輯的使用者可以查看與修改",
};

export function VisibilityIcon({ visibility, size = 14, className = "" }: { visibility: Visibility; size?: number; className?: string }) {
  const Icon = visibility === "private" ? Lock : visibility === "read" ? Eye : Users;
  return <Icon size={size} className={className} aria-label={VISIBILITY_LABELS[visibility]} />;
}

/** 上層分類中最嚴格的可見度（沒有上層時為 null） */
export function inheritedLimit(tree: Tree, categoryId: string | null): Visibility | null {
  let limit: Visibility | null = null;
  for (const c of categoryPath(tree.categories, categoryId)) {
    if (!limit || LEVEL[c.visibility] < LEVEL[limit]) limit = c.visibility;
  }
  return limit;
}

export function visibilityField(defaultValue: Visibility, hint?: string): FormField {
  return {
    name: "visibility",
    label: "誰可以看到",
    type: "radio",
    defaultValue,
    hint,
    options: (["private", "read", "edit"] as const).map((v) => ({
      value: v,
      label: VISIBILITY_LABELS[v],
      description: VISIBILITY_HINTS[v],
      icon: <VisibilityIcon visibility={v} size={16} />,
    })),
  };
}
