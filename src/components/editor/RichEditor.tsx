"use client";

import { Extension } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Redo2, Undo2 } from "lucide-react";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { parseMapBlock, type MapData, serializeMapBlock } from "@/lib/map";
import { locationLabel } from "@/lib/tree";
import { MapPicker } from "../map/MapPicker";
import { useDialogs, useToast } from "../Providers";
import { useWorkspace } from "../workspace";
import { CodeBlockView } from "./CodeBlockView";
import { BLOCK_ACTIONS, INSERT_ACTIONS, MARK_ACTIONS, type EditorAction, type EditorUi } from "./commands";
import { EditorContextMenu } from "./ContextMenu";
import { editorExtensions } from "./extensions";
import { tidyMarkdown } from "./markdown-utils";
import { MarkdownPaste } from "./paste";
import { SlashCommand, WikiSuggestion } from "./suggestions";
import { LINK_PLACEHOLDER } from "@/lib/site-content";

export interface RichEditorHandle {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  focus(): void;
}

const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function ToolButton({ action, editor, ui }: { action: EditorAction; editor: Editor; ui: EditorUi }) {
  const active = useEditorState({ editor, selector: ({ editor: e }) => (e ? !!action.isActive?.(e) : false) });
  return (
    <button
      type="button"
      title={action.shortcut ? `${action.label}（${action.shortcut}）` : action.label}
      aria-label={action.label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void action.run(editor, ui)}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-hover ${active ? "bg-active text-accent" : "text-muted"}`}
    >
      {action.icon}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />;

const BLOCK_SELECT = BLOCK_ACTIONS.filter((a) => a.key !== "codeBlock");

function Toolbar({ editor, ui }: { editor: Editor; ui: EditorUi }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e ? (BLOCK_ACTIONS.find((a) => a.key !== "paragraph" && a.isActive?.(e))?.key ?? "paragraph") : "paragraph",
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });
  const pick = (key: string) => BLOCK_ACTIONS.find((a) => a.key === key);
  const marks = MARK_ACTIONS.filter((a) => a.key !== "clear");
  const lists = ["bulletList", "orderedList", "taskList", "blockquote", "codeBlock"].map(pick).filter((a): a is EditorAction => !!a);
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto thin-scroll py-1" role="toolbar" aria-label="格式">
      <select
        value={BLOCK_SELECT.some((a) => a.key === state.block) ? state.block : ""}
        onChange={(e) => {
          const a = pick(e.target.value);
          if (a) void a.run(editor, ui);
        }}
        className="h-8 shrink-0 cursor-pointer rounded-md border border-line bg-bg px-2 text-sm outline-none hover:bg-hover"
        aria-label="段落樣式"
      >
        {!BLOCK_SELECT.some((a) => a.key === state.block) && <option value="">程式碼區塊</option>}
        {BLOCK_SELECT.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      <Sep />
      {marks.map((a) => (
        <ToolButton key={a.key} action={a} editor={editor} ui={ui} />
      ))}
      <Sep />
      {lists.map((a) => (
        <ToolButton key={a.key} action={a} editor={editor} ui={ui} />
      ))}
      <Sep />
      {INSERT_ACTIONS.filter((a) => a.key !== "command").map((a) => (
        <ToolButton key={a.key} action={a} editor={editor} ui={ui} />
      ))}
      <Sep />
      <button
        type="button"
        title="復原（Ctrl+Z）"
        aria-label="復原"
        disabled={!state.canUndo}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().undo().run()}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-30"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        title="重做（Ctrl+Shift+Z）"
        aria-label="重做"
        disabled={!state.canRedo}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().redo().run()}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover disabled:opacity-30"
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}

/**
 * Notion 風格的所見即所得編輯器，內容以 Markdown 讀寫。
 * 右鍵：剪下／複製／貼上與樣式；選取文字：浮動工具列；輸入「/」：插入區塊；輸入「[[」：連結筆記。
 */
export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    initialMarkdown: string;
    hidden?: boolean;
    onReady?: (markdown: string) => void;
    onChange?: () => void;
    /** 上方固定列（放進格式工具列） */
    header: (toolbar: ReactNode) => ReactNode;
    /** 固定列與內文之間（標題、標籤等） */
    top?: ReactNode;
  }
>(function RichEditor({ initialMarkdown, hidden = false, onReady, onChange, header, top }, ref) {
  const { tree } = useWorkspace();
  const dialogs = useDialogs();
  const toast = useToast();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [mapRequest, setMapRequest] = useState<{ initial: MapData | null; resolve: (v: string | null) => void } | null>(null);
  const callbacks = useRef({ onReady, onChange });
  callbacks.current = { onReady, onChange };

  const titlesRef = useRef<string[]>([]);
  titlesRef.current = useMemo(
    () => [...new Set(tree.notes.map((n) => n.title))].sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [tree.notes],
  );

  const ui: EditorUi = useMemo(
    () => ({
      async askLink(current) {
        const v = await dialogs.form({
          title: current ? "編輯連結" : "插入連結",
          fields: [
            {
              name: "href",
              label: "網址",
              defaultValue: current,
              placeholder: LINK_PLACEHOLDER,
              hint: current ? "清空後按確定可移除連結" : "也可以貼上站內網址，例如 /n/…",
            },
          ],
          submitLabel: "確定",
        });
        return v ? v.href : null;
      },
      async pickNote() {
        const options = [...tree.notes]
          .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"))
          .map((n) => ({ value: n.title, label: `${n.title}（${locationLabel(tree, n)}）` }));
        if (options.length === 0) {
          toast("還沒有其他筆記可以連結", "info");
          return null;
        }
        const v = await dialogs.form({
          title: "連結到筆記",
          description: "小技巧：在內文直接輸入「[[」也可以搜尋筆記。",
          fields: [{ name: "title", label: "筆記", type: "select", options, defaultValue: options[0].value }],
          submitLabel: "插入",
        });
        return v?.title || null;
      },
      async askImage() {
        const v = await dialogs.form({
          title: "插入圖片",
          fields: [
            { name: "src", label: "圖片網址", required: true, placeholder: "https://…/image.png" },
            { name: "alt", label: "說明文字", placeholder: "選填" },
          ],
          submitLabel: "插入",
        });
        if (!v) return null;
        if (!/^https?:\/\//i.test(v.src)) {
          toast("圖片網址需以 http:// 或 https:// 開頭", "error");
          return null;
        }
        return { src: v.src, alt: v.alt };
      },
      pickMap(current) {
        return new Promise((resolve) => setMapRequest({ initial: current ? parseMapBlock(current) : null, resolve }));
      },
    }),
    [dialogs, toast, tree],
  );
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const extensions = useMemo(
    () =>
      editorExtensions({
        codeBlockView: ReactNodeViewRenderer(CodeBlockView),
        extra: [
          SlashCommand(() => uiRef.current),
          WikiSuggestion(() => titlesRef.current),
          MarkdownPaste,
          Extension.create({
            name: "linkShortcut",
            addKeyboardShortcuts() {
              const link = MARK_ACTIONS.find((a) => a.key === "link")!;
              return {
                "Mod-k": () => {
                  void link.run(this.editor, uiRef.current);
                  return true;
                },
              };
            },
          }),
        ],
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: "markdown",
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "prose-note wn-editor", spellcheck: "false", "aria-label": "筆記內容" },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          // Shift + 右鍵、手機長按、地圖上：使用瀏覽器原本的選單
          if (event.shiftKey || isTouch() || (event.target as HTMLElement).closest?.(".map-block-view")) return false;
          event.preventDefault();
          const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const { from, to } = view.state.selection;
          if (hit && (hit.pos < from || hit.pos > to) && !(view.state.selection instanceof NodeSelection && hit.inside === from)) {
            view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))));
          }
          view.focus();
          setMenu({ x: event.clientX, y: event.clientY });
          return true;
        },
      },
    },
    onCreate: ({ editor: e }) => callbacks.current.onReady?.(tidyMarkdown(e.getMarkdown())),
    onUpdate: () => callbacks.current.onChange?.(),
  });

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (editor ? tidyMarkdown(editor.getMarkdown()) : initialMarkdown),
      setMarkdown: (markdown) => editor?.commands.setContent(markdown, { contentType: "markdown", emitUpdate: true }),
      focus: () => editor?.commands.focus(),
    }),
    [editor, initialMarkdown],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <>
      {header(editor && !hidden ? <Toolbar editor={editor} ui={ui} /> : null)}
      {top}
      <div className={hidden ? "hidden" : ""}>
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="space-y-3 py-2" aria-hidden="true">
            <div className="h-4 w-3/4 animate-pulse rounded bg-subtle" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-subtle" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-subtle" />
          </div>
        )}
      </div>

      {editor && !hidden && (
        <BubbleMenu
          editor={editor}
          options={{ placement: isTouch() ? "bottom" : "top", offset: 8 }}
          shouldShow={({ editor: e, state, from, to }) =>
            from !== to &&
            e.isEditable &&
            !e.isActive("codeBlock") &&
            !(state.selection instanceof NodeSelection) &&
            !("$anchorCell" in state.selection)
          }
          className={`z-[70] items-center gap-0.5 rounded-lg border border-line bg-card p-1 shadow-pop ${menu ? "hidden" : "flex"}`}
        >
          {MARK_ACTIONS.map((a) => (
            <ToolButton key={a.key} action={a} editor={editor} ui={ui} />
          ))}
        </BubbleMenu>
      )}

      {editor && menu && (
        <EditorContextMenu editor={editor} ui={ui} x={menu.x} y={menu.y} onClose={closeMenu} onError={(m) => toast(m, "error")} />
      )}

      {mapRequest && (
        <MapPicker
          open
          initial={mapRequest.initial}
          onClose={() => {
            mapRequest.resolve(null);
            setMapRequest(null);
          }}
          onConfirm={(data) => {
            mapRequest.resolve(serializeMapBlock(data));
            setMapRequest(null);
          }}
        />
      )}
    </>
  );
});
