"use client";

// LinkedIn Cover 1584×396 (4:1).
//
// Layout horizontal: foto a la izquierda con overlay degradado hacia el
// centro, monograma + tagline + subline a la derecha. Inspirado en
// covers de bufetes serios (Latham, Cravath).

import { renderRichText } from "@/lib/marketing/rich-text";
import { resolveFont, GoldenLine } from "./_shared";

type Props = { values: Record<string, string | number> };

export function LinkedInCover({ values }: Props) {
  const photo = String(values.photo ?? "");
  const tagline = String(values.tagline ?? "");
  const subline = String(values.subline ?? "");
  const wordmarkHeight = Number(values.wordmarkHeight ?? 132);
  const position = String(values.position ?? "center 58%");
  const font = resolveFont(values.font);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: photo
          ? `url(${photo}) ${position}/cover no-repeat`
          : "linear-gradient(135deg, #0a1f3b 0%, #14304f 50%, #1a3a5f 100%)",
        color: "#efe7d5",
      }}
    >
      {/* Overlay: oscuro a la derecha, transparente a la izquierda */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,13,26,0.45) 0%, rgba(5,13,26,0.20) 30%, rgba(5,13,26,0.78) 65%, rgba(5,13,26,0.92) 100%)",
        }}
      />

      {/* Wordmark + tagline a la derecha */}
      <div
        className="absolute right-0 top-0 h-full flex flex-col justify-center"
        style={{ paddingRight: 80, paddingLeft: 40, gap: 14, maxWidth: "62%" }}
      >
        {/* Monogram (LDP serif large) */}
        <div
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: wordmarkHeight,
            fontWeight: 500,
            letterSpacing: "0.18em",
            color: "#efe7d5",
            textShadow: "0 4px 18px rgba(0,0,0,0.5)",
            lineHeight: 1,
          }}
        >
          LDP
        </div>
        <div
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 12,
            letterSpacing: "0.40em",
            color: "rgba(239,231,213,0.78)",
            textTransform: "uppercase",
            marginTop: -8,
          }}
        >
          Legal Advisors
        </div>
        <GoldenLine width={80} style={{ marginTop: 6 }} />
        <p
          style={{
            fontFamily: font,
            fontSize: 28,
            lineHeight: 1.25,
            color: "#efe7d5",
            margin: 0,
            marginTop: 10,
            fontWeight: 400,
            letterSpacing: "0.01em",
          }}
        >
          {renderRichText(tagline)}
        </p>
        {subline ? (
          <p
            style={{
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 13,
              letterSpacing: "0.06em",
              color: "rgba(239,231,213,0.72)",
              margin: 0,
              marginTop: 2,
            }}
          >
            {subline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
