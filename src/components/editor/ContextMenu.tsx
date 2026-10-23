"use client";

import type { Editor } from "@tiptap/core";
import {
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ClipboardPaste, ClipboardType, Columns3, Copy,
  Rows3, Scissors, TextSelect, Trash2,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BLOCK_ACTIONS, INSERT_ACTIONS, MARK_ACTIONS, type EditorAction, type EditorUi } from "./commands";
import { insertMarkdown } from "./paste";
import { looksLikeMarkdown } from "./markdown-utils";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = (key: string) => (isMac() ? `⌘${key}` : `Ctrl+${key}`);

/** 從剪貼簿貼上（瀏覽器需允許讀取剪貼簿；失敗時回傳 false） */
async function pasteFromClipboard(editor: Editor, plain: boolean): Promise<boolean> {
  try {
    if (!plain && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          editor.view.focus();
          editor.view.pasteHTML(html);
          return true;
        }
      }
    }
    const text = await navigator.clipboard.readText();
    editor.view.focus();
    if (!plain && looksLikeMarkdown(text) && !editor.isActive("codeBlock") && insertMarkdown(editor, text)) return true;
    editor.view.pasteText(text);
    return true;
  } catch {
    return false;
  }
}

function Item({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "text-danger" : ""
      }`}
    >
      <span className="flex w-4 shrink-0 justify-center text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-faint">{shortcut}</span>}
    </button>
  );
}

function IconRow({ actions, editor, ui, close }: { actions: EditorAction[]; editor: Editor; ui: EditorUi; close: () => void }) {
  return (
    <div className="flex flex-wrap gap-0.5 px-1.5 py-1">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          title={a.shortcut ? `${a.label}（${a.shortcut}）` : a.label}
          aria-label={a.label}
          onClick={() => {
            close();
            void a.run(editor, ui);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-hover ${
            a.isActive?.(editor) ? "bg-active text-accent" : "text-fg"
          }`}
        >
          {a.icon}
        </button>
      ))}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold text-faint">{children}</div>
);
const Divider = () => <div className="my-1 border-t border-line" />;

/** 編輯器的右鍵選單：剪下／複製／貼上 + 文字樣式、轉換區塊、插入、表格操作 */
export function EditorContextMenu({
  editor,
  ui,
  x,
  y,
  onClose,
  onError,
}: {
  editor: Editor;
  ui: EditorUi;
  x: number;
  y: number;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const hasSelection = !editor.state.selection.empty;
  const inTable = editor.isActive("table");
  const inCode = editor.isActive("codeBlock");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    const top = y + h > window.innerHeight - 8 ? Math.max(8, Math.min(y - h, window.innerHeight - h - 8)) : y;
    setPos({ left, top, ready: true });
  }, [x, y]);

  const clip = (cmd: "cut" | "copy") => {
    onClose();
    editor.view.focus();
    let ok = false;
    try {
      ok = document.execCommand(cmd);
    } catch {
      ok = false;
    }
    if (!ok) onError(`瀏覽器不允許從選單${cmd === "cut" ? "剪下" : "複製"}，請改按 ${mod(cmd === "cut" ? "X" : "C")}`);
  };

  const paste = async (plain: boolean) => {
    onClose();
    const ok = await pasteFromClipboard(editor, plain);
    if (!ok) onError(`瀏覽器不允許從選單貼上，請改按 ${mod(plain ? "Shift+V" : "V")}`);
  };

  const table = (fn: () => boolean) => () => {
    onClose();
    fn();
  };
  const tc = () => editor.chain().focus();

  return createPortal(
    <>
      <div className="fixed inset-0 z-[84]" onMouseDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div
        ref={ref}
        role="menu"
        // 保持編輯器的選取範圍與焦點
        onMouseDown={(e) => e.preventDefault()}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
        className="fixed z-[85] max-h-[calc(100dvh-16px)] w-64 overflow-y-auto thin-scroll rounded-lg border border-line bg-card p-1 shadow-pop"
      >
        <Item icon={<Scissors size={15} />} label="剪下" shortcut={mod("X")} disabled={!hasSelection} onClick={() => clip("cut")} />
        <Item icon={<Copy size={15} />} label="複製" shortcut={mod("C")} disabled={!hasSelection} onClick={() => clip("copy")} />
        <Item icon={<ClipboardPaste size={15} />} label="貼上" shortcut={mod("V")} onClick={() => paste(false)} />
        <Item icon={<ClipboardType size={15} />} label="貼上為純文字" shortcut={mod("Shift+V")} onClick={() => paste(true)} />
        <Item
          icon={<TextSelect size={15} />}
          label="全選"
          shortcut={mod("A")}
          onClick={() => {
            onClose();
            editor.chain().focus().selectAll().run();
          }}
        />

        {!inCode && (
          <>
            <Divider />
            <Label>文字樣式</Label>
            <IconRow actions={MARK_ACTIONS} editor={editor} ui={ui} close={onClose} />
          </>
        )}

        <Divider />
        <Label>轉換成</Label>
        <IconRow actions={BLOCK_ACTIONS} editor={editor} ui={ui} close={onClose} />

        {inTable && (
          <>
            <Divider />
            <Label>表格</Label>
            <Item icon={<ArrowUpToLine size={15} />} label="在上方插入列" onClick={table(() => tc().addRowBefore().run())} />
            <Item icon={<ArrowDownToLine size={15} />} label="在下方插入列" onClick={table(() => tc().addRowAfter().run())} />
            <Item icon={<ArrowLeftToLine size={15} />} label="在左側插入欄" onClick={table(() => tc().addColumnBefore().run())} />
            <Item icon={<ArrowRightToLine size={15} />} label="在右側插入欄" onClick={table(() => tc().addColumnAfter().run())} />
            <Item icon={<Rows3 size={15} />} label="刪除這一列" onClick={table(() => tc().deleteRow().run())} />
            <Item icon={<Columns3 size={15} />} label="刪除這一欄" onClick={table(() => tc().deleteColumn().run())} />
            <Item icon={<Trash2 size={15} />} label="刪除表格" danger onClick={table(() => tc().deleteTable().run())} />
          </>
        )}

        {!inCode && (
          <>
            <Divider />
            <Label>插入</Label>
            {INSERT_ACTIONS.map((a) => (
              <Item
                key={a.key}
                icon={a.icon}
                label={a.label}
                onClick={() => {
                  onClose();
                  void a.run(editor, ui);
                }}
              />
            ))}
          </>
        )}
        <div className="mt-1 border-t border-line px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-faint">
          按住 Shift 再按右鍵可開啟瀏覽器原本的選單
        </div>
      </div>
    </>,
    document.body,
  );
}
