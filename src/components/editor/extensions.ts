import { Extension, type AnyExtension, type NodeViewRenderer } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { WikiLink } from "./wiki-link";

const lowlight = createLowlight(common);

/** 與檢視模式（rehype-highlight，detect: false）一致：沒有指定語言就不自動偵測上色 */
const plainLowlight = {
  highlight: (language: string, value: string) => lowlight.highlight(language, value),
  highlightAuto: (value: string) => ({ type: "root", children: [{ type: "text", value }], data: {} }),
  listLanguages: () => lowlight.listLanguages(),
  registered: (language: string) => lowlight.registered(language),
};

export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: "", label: "純文字" },
  { value: "bash", label: "Bash / Shell" },
  { value: "console", label: "終端輸出" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "ini", label: "INI / 設定檔" },
  { value: "xml", label: "XML / HTML" },
  { value: "powershell", label: "PowerShell" },
  { value: "sql", label: "SQL" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "diff", label: "Diff" },
  { value: "makefile", label: "Makefile" },
  { value: "map", label: "🗺️ 地圖" },
];

/**
 * 地圖區塊（```map）在編輯器中顯示成地圖，裡面的座標文字不直接編輯：
 * 游標進入時改成選取整個區塊（像圖片一樣，可整塊刪除或複製），避免打字改壞座標。
 */
const MapBlockGuard = Extension.create({
  name: "mapBlockGuard",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("mapBlockGuard"),
        props: {
          // 選取地圖區塊時直接打字不會把地圖換掉（要刪除請按 Backspace／Delete 或「移除」）
          handleTextInput(view) {
            const sel = view.state.selection;
            return sel instanceof NodeSelection && sel.node.type.name === "codeBlock" && sel.node.attrs.language === "map";
          },
        },
        appendTransaction(_trs, _old, state) {
          const { selection } = state;
          if (!(selection instanceof TextSelection)) return null;
          const $from = selection.$from;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === "codeBlock" && node.attrs.language === "map") {
              return state.tr.setSelection(NodeSelection.create(state.doc, $from.before(d)));
            }
          }
          return null;
        },
      }),
    ];
  },
});

export function editorExtensions(options: {
  codeBlockView?: NodeViewRenderer;
  placeholder?: string;
  extra?: AnyExtension[];
} = {}): AnyExtension[] {
  const codeBlock = CodeBlockLowlight.configure({
    lowlight: plainLowlight,
    defaultLanguage: null,
    enableTabIndentation: true,
    tabSize: 2,
  });
  return [
    StarterKit.configure({
      // ++底線++ 不是標準 Markdown，檢視模式無法顯示，因此不提供
      underline: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https" },
    }),
    options.codeBlockView ? codeBlock.extend({ addNodeView: () => options.codeBlockView! }) : codeBlock,
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image,
    WikiLink,
    Placeholder.configure({
      placeholder: options.placeholder ?? "輸入內容，或按「/」插入標題、清單、指令區塊、表格…",
      showOnlyCurrent: true,
    }),
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
    MapBlockGuard,
    ...(options.extra ?? []),
  ];
}
