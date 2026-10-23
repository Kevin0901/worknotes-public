"use client";

import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { VISIBILITY_LABELS } from "@/lib/access";
import { api, errorMessage } from "@/lib/client-api";
import type { GuideMeta } from "@/lib/types";
import { useDialogs, useToast } from "../Providers";
import { VISIBILITY_HINTS, VisibilityIcon } from "../Visibility";

/** 教學頁標題下方的權限標籤：可見度、所在空間、擁有者（管理員） */
export function GuideAccessBadge({ guide }: { guide: GuideMeta }) {
  const effective = guide.visibility === "private" ? "private" : "read";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
      <span className="chip" title={effective === "private" ? "只有管理員看得到" : VISIBILITY_HINTS.read}>
        <VisibilityIcon visibility={effective} size={11} />
        {VISIBILITY_LABELS[effective]}
      </span>
      <span>公共區</span>
      <span>擁有者 管理員</span>
    </div>
  );
}

/** 擁有者或管理員可變更教學頁的可見度（內容在程式中，所以沒有「可編輯」） */
export function GuideShareButton({ guide }: { guide: GuideMeta }) {
  const dialogs = useDialogs();
  const toast = useToast();
  const router = useRouter();
  if (!guide.canManage) return null;

  const share = async () => {
    const v = await dialogs.form({
      title: `分享與權限：${guide.title}`,
      description: "教學頁的內容在程式中，沒有「可編輯」設定。擁有者為管理員，放在公共區。",
      fields: [
        {
          name: "visibility",
          label: "誰可以看到",
          type: "radio",
          defaultValue: guide.visibility === "private" ? "private" : "read",
          options: (["private", "read"] as const).map((v) => ({
            value: v,
            label: VISIBILITY_LABELS[v],
            description: v === "private" ? "只有管理員看得到" : VISIBILITY_HINTS.read,
            icon: <VisibilityIcon visibility={v} size={16} />,
          })),
        },
      ],
      submitLabel: "儲存",
    });
    if (!v) return;
    try {
      await api("PATCH", `/api/guides/${guide.slug}`, { visibility: v.visibility });
      toast("已更新權限");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <button type="button" className="btn" onClick={share}>
      <Share2 size={15} />
      分享與權限
    </button>
  );
}
