// lib/ai/docx-generator.ts
//
// Converts the Markdown that Claude produces into a .docx file with the
// LDP formatting rules (Charter Roman 11pt, 1.00"/1.25" margins, justified
// alignment, ALL-CAPS+bold for role designations, etc.).
//
// We use docx (the JS lib) instead of running a Python service so the
// generation happens in the same Vercel function as the AI call — fewer
// moving parts, no extra deployment.
//
// The Markdown contract with Claude (declared in the system prompt):
//   - `# Heading 1` → docx Heading1 style
//   - `## Heading 2` → Heading2
//   - `### Heading 3` → Heading3
//   - `**bold**` → bold run
//   - `*italic*` → italic run
//   - `[DATO PENDIENTE: x]` → highlighted yellow with a comment in the doc
//   - Otherwise plain paragraph
//
// We DON'T try to be a full markdown→docx renderer; we cover what Claude
// emits with the LDP skills. Anything fancier is wrapped in plain text.

import "server-only";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageOrientation,
  convertInchesToTwip,
} from "docx";

const CHARTER = "Charter";
const BODY_FONT_SIZE = 22; // half-points → 11pt
const HEADING1_SIZE = 32; // 16pt
const HEADING2_SIZE = 26; // 13pt
const HEADING3_SIZE = 24; // 12pt

export async function renderMarkdownToDocx(input: {
  title: string;
  body: string;
}): Promise<Uint8Array> {
  const paragraphs = parseBody(input.body);

  const doc = new Document({
    creator: "LDP Legal Suite",
    title: input.title,
    description: "Documento generado por IA (pendiente de revisión humana)",
    styles: {
      default: {
        document: {
          run: { font: CHARTER, size: BODY_FONT_SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: {
              top: convertInchesToTwip(1.0),
              bottom: convertInchesToTwip(1.0),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

// =============================================================================
// Markdown parsing — narrow but sufficient for LDP-generated bodies.
// =============================================================================

function parseBody(body: string): Paragraph[] {
  const lines = body.split(/\r?\n/);
  const paragraphs: Paragraph[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      paragraphs.push(makeHeading(line.slice(4), HeadingLevel.HEADING_3, HEADING3_SIZE));
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(makeHeading(line.slice(3), HeadingLevel.HEADING_2, HEADING2_SIZE));
      continue;
    }
    if (line.startsWith("# ")) {
      paragraphs.push(makeHeading(line.slice(2), HeadingLevel.HEADING_1, HEADING1_SIZE));
      continue;
    }

    // Bullets with en-dash (LDP convention) — match both "- " and "– "
    if (/^[–-]\s+/.test(line)) {
      const content = line.replace(/^[–-]\s+/, "");
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "– ", font: CHARTER }), ...renderInlineRuns(content)],
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertInchesToTwip(0.25) },
        }),
      );
      continue;
    }

    // Plain paragraph
    paragraphs.push(
      new Paragraph({
        children: renderInlineRuns(line),
        alignment: AlignmentType.JUSTIFIED,
      }),
    );
  }
  return paragraphs;
}

function makeHeading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel], size: number): Paragraph {
  return new Paragraph({
    heading: level,
    alignment: level === HeadingLevel.HEADING_1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        bold: true,
        font: CHARTER,
        size,
        allCaps: level === HeadingLevel.HEADING_1,
      }),
    ],
  });
}

// Resolve **bold** and *italic* and [DATO PENDIENTE: x] within a line into
// docx TextRun blocks. Conservative parser — only the three patterns above,
// in order of specificity.
function renderInlineRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const end = line.indexOf("**", i + 2);
      if (end > -1) {
        runs.push(new TextRun({ text: line.slice(i + 2, end), bold: true, font: CHARTER }));
        i = end + 2;
        continue;
      }
    }
    if (line.startsWith("[DATO PENDIENTE", i)) {
      const end = line.indexOf("]", i);
      if (end > -1) {
        runs.push(
          new TextRun({
            text: line.slice(i, end + 1),
            highlight: "yellow",
            bold: true,
            font: CHARTER,
          }),
        );
        i = end + 1;
        continue;
      }
    }
    if (line.startsWith("*", i) && !line.startsWith("**", i)) {
      const end = line.indexOf("*", i + 1);
      if (end > -1) {
        runs.push(new TextRun({ text: line.slice(i + 1, end), italics: true, font: CHARTER }));
        i = end + 1;
        continue;
      }
    }
    // Plain text run — eat until next special marker or end.
    let next = line.length;
    for (const marker of ["**", "*", "[DATO PENDIENTE"]) {
      const idx = line.indexOf(marker, i);
      if (idx > -1 && idx < next) next = idx;
    }
    runs.push(new TextRun({ text: line.slice(i, next), font: CHARTER }));
    i = next;
  }
  return runs;
}
