// Extract plain text from a Tiptap JSON document. Used for previews / search.
// Tiptap docs are nested {type, content: [{type, content/text, ...}, ...]}.
// We just walk the tree and concatenate every text leaf.

export function extractTiptapText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  function walk(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === "string") return n.text;
    if (Array.isArray(n.content)) {
      return (n.content as unknown[]).map(walk).join(" ");
    }
    return "";
  }
  return walk(doc).replace(/\s+/g, " ").trim();
}

export function preview(doc: unknown, limit = 160): string {
  const t = extractTiptapText(doc);
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}
