"use client";

import { FilePlus, FolderPlus } from "lucide-react";
import { useWorkspaceActions } from "./workspace";

export function HomeActions() {
  const actions = useWorkspaceActions();
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="btn" onClick={() => actions.createCategory(null)}>
        <FolderPlus size={15} /> 新增分類
      </button>
      <button type="button" className="btn" onClick={() => actions.createNote(null)}>
        <FilePlus size={15} /> 新增筆記
      </button>
    </div>
  );
}
