// Convertidor server-side de un doc Tiptap (JSON) a HTML.
//
// Por qué hacemos esto a mano:
//   - @tiptap/html requiere JSDOM (corre prosemirror real en node) — pesa
//     varios MB y demora el cold start.
//   - El StarterKit que usamos en RichTextEditor solo trae un puñado de
//     nodos / marks. Mapearlos a HTML es ~80 líneas y no necesita
//     dependencias extra.
//
// Cobertura: doc, paragraph, text, heading 1-6, bullet/ordered list,
// listItem, blockquote, hardBreak, horizontalRule, codeBlock; marks
// bold, italic, strike, code, link.

type TiptapMark = { type: string; attrs?: Record<string, unknown> };
type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarks(marks: TiptapMark[] | undefined, content: string): string {
  if (!marks || marks.length === 0) return content;
  let out = content;
  // Aplicar en orden inverso para que el primer mark quede como el wrapper más externo.
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (!m) continue;
    switch (m.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = typeof m.attrs?.href === "string" ? escapeAttr(m.attrs.href) : "#";
        out = `<a href="${href}" target="_blank" rel="noopener">${out}</a>`;
        break;
      }
    }
  }
  return out;
}

function renderChildren(content: TiptapNode[] | undefined): string {
  if (!content) return "";
  return content.map(renderNode).join("");
}

function renderNode(n: TiptapNode): string {
  switch (n.type) {
    case "doc":
      return renderChildren(n.content);
    case "paragraph":
      return `<p>${renderChildren(n.content)}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 2));
      return `<h${level}>${renderChildren(n.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(n.content)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(n.content)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(n.content)}</li>`;
    case "blockquote":
      return `<blockquote>${renderChildren(n.content)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml(n.content?.map((c) => c.text ?? "").join("") ?? "")}</code></pre>`;
    case "horizontalRule":
      return `<hr />`;
    case "hardBreak":
      return `<br />`;
    case "text":
      return renderMarks(n.marks, escapeHtml(n.text ?? ""));
    default:
      // Nodo desconocido — renderizamos sus hijos para no perder contenido.
      return renderChildren(n.content);
  }
}

export function tiptapJsonToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  return renderNode(doc as TiptapNode);
}

export function tiptapJsonToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const out: string[] = [];
  const walk = (n: TiptapNode) => {
    if (n.text) out.push(n.text);
    if (n.content) n.content.forEach(walk);
    if (n.type === "paragraph" || n.type === "heading" || n.type === "listItem") {
      out.push("\n");
    }
  };
  walk(doc as TiptapNode);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}
