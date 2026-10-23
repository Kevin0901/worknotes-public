"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { Note } from "@/lib/types";
import { useToast } from "./Providers";

export function TrashedNotice({ note, canEdit }: { note: Note; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <Trash2 size={36} className="mx-auto text-faint" />
      <h1 className="mt-4 text-xl font-semibold">「{note.title}」已在垃圾桶中</h1>
      <p className="mt-2 text-sm text-muted">刪除時間：{formatDateTime(note.deletedAt)}</p>
      <div className="mt-6 flex justify-center gap-2">
        {canEdit && (
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              try {
                await api("POST", `/api/notes/${note.id}/restore`);
                toast("已還原筆記");
                router.refresh();
              } catch (err) {
                toast(errorMessage(err), "error");
              }
            }}
          >
            <RotateCcw size={15} /> 還原
          </button>
        )}
        <Link href="/trash" className="btn">
          前往垃圾桶
        </Link>
      </div>
    </div>
  );
}
