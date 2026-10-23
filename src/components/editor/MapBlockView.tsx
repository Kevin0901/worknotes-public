"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { parseMapBlock, serializeMapBlock, type MapData } from "@/lib/map";
import { MapCard } from "../map/MapCard";
import { MapPicker } from "../map/MapPicker";

/** 編輯器中的地圖區塊（```map）：顯示地圖，按「編輯位置」重新選擇 */
export function MapBlockView({ node, editor, getPos, deleteNode }: NodeViewProps) {
  const data = parseMapBlock(node.textContent);
  const [picking, setPicking] = useState(false);

  const save = (next: MapData) => {
    setPicking(false);
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const current = tr.doc.nodeAt(pos);
        if (!current) return false;
        tr.replaceWith(pos + 1, pos + current.nodeSize - 1, editor.schema.text(serializeMapBlock(next)));
        return true;
      })
      .run();
  };

  const btn = "inline-flex items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 py-1.5 text-xs font-medium hover:bg-hover";

  return (
    <NodeViewWrapper className="map-block-view">
      <div contentEditable={false}>
        {data ? (
          <MapCard
            data={data}
            actions={
              editor.isEditable && (
                <>
                  <button type="button" className={btn} onClick={() => setPicking(true)}>
                    <Pencil size={13} /> 編輯位置
                  </button>
                  <button type="button" className={`${btn} text-danger`} onClick={() => deleteNode()}>
                    <Trash2 size={13} /> 移除
                  </button>
                </>
              )
            }
          />
        ) : (
          <div className="my-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
            <MapPin size={16} className="text-danger" />
            <span className="flex-1">地圖資料不完整，請重新選擇位置</span>
            <button type="button" className={btn} onClick={() => setPicking(true)}>
              <Pencil size={13} /> 選擇位置
            </button>
            <button type="button" className={`${btn} text-danger`} onClick={() => deleteNode()}>
              <Trash2 size={13} /> 移除
            </button>
          </div>
        )}
        {picking && <MapPicker open initial={data} onClose={() => setPicking(false)} onConfirm={save} />}
      </div>
      {/* 座標文字仍保留在文件中（存成 Markdown 用），但不直接編輯 */}
      <NodeViewContent<"code"> as="code" className="hidden" />
    </NodeViewWrapper>
  );
}
