"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { useDialogs, useToast } from "../Providers";

export function PurgeLogsButton({ defaultDays }: { defaultDays: number }) {
  const router = useRouter();
  const dialogs = useDialogs();
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn text-danger"
      onClick={async () => {
        const v = await dialogs.form({
          title: "清除舊紀錄",
          description: "刪除指定天數以前的所有訪問紀錄（輸入 0 代表全部清除），無法復原。",
          fields: [{ name: "days", label: "保留最近幾天", type: "number", defaultValue: String(defaultDays), required: true }],
          submitLabel: "清除",
        });
        if (!v) return;
        try {
          const res = await api<{ count: number }>("DELETE", "/api/admin/logs", { olderThanDays: Number(v.days) });
          toast(`已清除 ${res.count} 筆紀錄`);
          router.refresh();
        } catch (err) {
          toast(errorMessage(err), "error");
        }
      }}
    >
      <Trash2 size={15} /> 清除舊紀錄
    </button>
  );
}
