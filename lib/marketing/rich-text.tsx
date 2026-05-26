// Parser de copy con sintaxis *cursiva azul*.
//
// La copy de Gabriel usa asteriscos para marcar palabras que deben salir en
// italic + azul muted (típico estilo editorial de bufete). Por ejemplo:
//
//   "Una firma boutique de *abogados* dominicanos"
//
// → "Una firma boutique de [italic blue]abogados[/italic blue] dominicanos"
//
// Los saltos de línea (\n) se preservan como <br />.

import { Fragment, type ReactNode } from "react";

const ITALIC_RE = /\*([^*]+)\*/g;
const ITALIC_COLOR = "#a3b8d9"; // mismo blue muted del HTML original

export function renderRichText(input: string): ReactNode {
  if (!input) return null;

  const lines = input.split("\n");
  return lines.map((line, lineIdx) => {
    // Split each line by italic markers
    const parts: ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    ITALIC_RE.lastIndex = 0;
    while ((m = ITALIC_RE.exec(line)) !== null) {
      if (m.index > lastIdx) {
        parts.push(line.slice(lastIdx, m.index));
      }
      parts.push(
        <em
          key={`it-${lineIdx}-${m.index}`}
          style={{ color: ITALIC_COLOR, fontStyle: "italic" }}
        >
          {m[1]}
        </em>,
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < line.length) {
      parts.push(line.slice(lastIdx));
    }

    return (
      <Fragment key={lineIdx}>
        {parts}
        {lineIdx < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}
