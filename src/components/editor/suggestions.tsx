"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { FileText, Plus } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { filterActions, runFromRange, SLASH_ACTIONS, type EditorUi } from "./commands";

export interface SuggestionItem {
  key: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  select: (editor: Editor, range: Range) => void;
}

interface ListProps {
  items: SuggestionItem[];
  title: string;
  empty: string;
  command: (item: SuggestionItem) => void;
}

export interface ListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const SuggestionList = forwardRef<ListHandle, ListProps>(function SuggestionList({ items, title, empty, command }, ref) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIndex(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[index]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      ref={listRef}
      className="max-h-80 w-64 overflow-y-auto thin-scroll rounded-lg border border-line bg-card p-1 shadow-pop"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-faint">{title}</div>
      {items.length === 0 && <div className="px-2.5 py-2 text-sm text-faint">{empty}</div>}
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          data-index={i}
          onClick={() => command(item)}
          onMouseEnter={() => setIndex(i)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm ${i === index ? "bg-active" : ""}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-muted">
            {item.icon}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && <span className="shrink-0 text-[11px] text-faint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
});

/** 用 ReactRenderer 顯示選單，位置交給 suggestion 外掛的 mount() 處理 */
function popupRenderer(title: string, empty: string) {
  return () => {
    let component: ReactRenderer<ListHandle, ListProps> | null = null;
    let unmount: (() => void) | undefined;
    const toProps = (props: SuggestionProps<SuggestionItem, SuggestionItem>): ListProps => ({
      items: props.items,
      title,
      empty,
      command: (item) => props.command(item),
    });
    return {
      onStart(props: SuggestionProps<SuggestionItem, SuggestionItem>) {
        component = new ReactRenderer(SuggestionList, { props: toProps(props), editor: props.editor });
        (component.element as HTMLElement).style.zIndex = "80";
        unmount = props.mount(component.element as HTMLElement);
      },
      onUpdate(props: SuggestionProps<SuggestionItem, SuggestionItem>) {
        component?.updateProps(toProps(props));
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") return false;
        return component?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit() {
        unmount?.();
        component?.destroy();
        component = null;
      },
    };
  };
}

const notInCode = ({ editor }: { editor: Editor }) => !editor.isActive("codeBlock") && !editor.isActive("code");

/** 「/」插入區塊選單 */
export function SlashCommand(getUi: () => EditorUi) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SuggestionItem, SuggestionItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slashCommand"),
          char: "/",
          allow: notInCode,
          items: ({ query }) =>
            filterActions(SLASH_ACTIONS, query).map((action) => ({
              key: action.key,
              label: action.label,
              icon: action.icon,
              select: (editor, range) => void runFromRange(editor, range, action, getUi()),
            })),
          command: ({ editor, range, props }) => props.select(editor, range),
          render: popupRenderer("插入區塊", "沒有符合的項目"),
        }),
      ];
    },
  });
}

/** 輸入「[[」時選擇要連結的筆記 */
export function WikiSuggestion(getTitles: () => string[]) {
  return Extension.create({
    name: "wikiSuggestion",
    addProseMirrorPlugins() {
      return [
        Suggestion<SuggestionItem, SuggestionItem>({
          editor: this.editor,
          pluginKey: new PluginKey("wikiSuggestion"),
          char: "[[",
          allowSpaces: true,
          allowedPrefixes: null,
          allow: notInCode,
          items: ({ query }) => {
            const q = query.replace(/\]+$/, "").trim();
            const titles = getTitles();
            const lower = q.toLowerCase();
            const matched = (q ? titles.filter((t) => t.toLowerCase().includes(lower)) : titles).slice(0, 8);
            const insert = (title: string) => (editor: Editor, range: Range) =>
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent([{ type: "wikiLink", attrs: { title } }, { type: "text", text: " " }])
                .run();
            const items: SuggestionItem[] = matched.map((t) => ({
              key: `n:${t}`,
              label: t,
              icon: <FileText size={14} />,
              select: insert(t),
            }));
            if (q && !titles.some((t) => t.toLowerCase() === lower)) {
              items.push({ key: "new", label: `連結到「${q}」`, hint: "尚無此筆記", icon: <Plus size={14} />, select: insert(q) });
            }
            return items;
          },
          command: ({ editor, range, props }) => props.select(editor, range),
          render: popupRenderer("連結到筆記", "輸入筆記標題搜尋"),
        }),
      ];
    },
  });
}
