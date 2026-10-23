import { InputRule, Node, mergeAttributes } from "@tiptap/core";

const WIKI_RE = /^\[\[([^\]\n]{1,200})\]\]/;

/**
 * [[筆記標題]] 連結：在編輯器中顯示成一個小標籤，存回 Markdown 時維持 [[標題]] 原樣
 * （避免一般文字的 [ ] 被跳脫成 \[\[ \]\] 而失去連結）。
 */
export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-wiki-link": "", class: "wiki-link", title: `連結到筆記「${node.attrs.title}」` }),
      `📄 ${node.attrs.title}`,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.title}]]`;
  },

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start(src: string) {
      return src.indexOf("[[");
    },
    tokenize(src: string) {
      const m = WIKI_RE.exec(src);
      if (!m) return undefined;
      return { type: "wikiLink", raw: m[0], title: m[1].trim() };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("wikiLink", { title: String(token.title ?? "") });
  },

  renderMarkdown(node) {
    return `[[${node.attrs?.title ?? ""}]]`;
  },

  addInputRules() {
    // 直接輸入 [[標題]] 時轉成連結
    return [
      new InputRule({
        find: /\[\[([^\]\n]{1,200})\]\]$/,
        handler: ({ state, range, match }) => {
          const title = match[1].trim();
          if (!title) return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ title }));
        },
      }),
    ];
  },
});
