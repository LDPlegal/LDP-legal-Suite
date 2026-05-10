// Tiptap stores rich-text as a JSON tree. For AI prompts we just need the
// plain text — strip the formatting and concatenate. The exact tree shape
// is `{ type, content?, text? }` recursively; we walk it and collect text
// nodes, inserting newlines at paragraph boundaries.

type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
};

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bullet_list",
  "ordered_list",
  "list_item",
  "blockquote",
]);

export function tiptapToPlainText(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const out: string[] = [];
  walk(input as TiptapNode, out);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function walk(node: TiptapNode, out: string[]): void {
  if (typeof node.text === "string") {
    out.push(node.text);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, out);
  }
  if (node.type && BLOCK_TYPES.has(node.type)) {
    out.push("\n");
  }
}
