"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { NoteMeta } from "@/lib/types";
import { useDialogs, useToast } from "./Providers";

export function TrashList({ notes }: { notes: (NoteMeta & { deletedAt: string })[] }) {
  const router = useRouter();
  const toast = useToast();
  const dialogs = useDialogs();

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const editable = notes.filter((n) => n.canEdit).length;

  if (notes.length === 0) {
    return <p className="mt-8 rounded-lg border border-dashed border-line p-10 text-center text-sm text-faint">垃圾桶是空的</p>;
  }

  return (
    <>
      {editable > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-danger"
            onClick={async () => {
              const ok = await dialogs.confirm({
                title: "清空垃圾桶？",
                message:
                  editable === notes.length
                    ? `將永久刪除 ${editable} 篇筆記（含版本紀錄），無法復原。`
                    : `將永久刪除你有編輯權限的 ${editable} 篇筆記（含版本紀錄），無法復原；其他人的筆記不受影響。`,
                confirmLabel: "永久刪除",
                danger: true,
              });
              if (ok) await act(() => api("DELETE", "/api/trash"), "已清空垃圾桶");
            }}
          >
            <Trash2 size={15} /> 清空垃圾桶
          </button>
        </div>
      )}
      <div className="card mt-4 divide-y divide-[var(--border)]">
        {notes.map((n) => (
          <div key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Link href={`/n/${n.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {n.icon || "📄"} {n.title}
              </div>
              <div className="text-xs text-faint">刪除於 {formatDateTime(n.deletedAt)}</div>
            </Link>
            {n.canEdit && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn"
                  onClick={() => act(() => api("POST", `/api/notes/${n.id}/restore`), "已還原")}
                >
                  <RotateCcw size={14} /> 還原
                </button>
                <button
                  type="button"
                  className="btn text-danger"
                  onClick={async () => {
                    const ok = await dialogs.confirm({
                      title: `永久刪除「${n.title}」？`,
                      message: "此動作無法復原。",
                      confirmLabel: "永久刪除",
                      danger: true,
                    });
                    if (ok) await act(() => api("DELETE", `/api/notes/${n.id}?permanent=1`), "已永久刪除");
                  }}
                >
                  <Trash2 size={14} /> 永久刪除
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
