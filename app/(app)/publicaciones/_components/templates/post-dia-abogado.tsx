"use client";

// Post 04 — Día del Abogado
//
// Diseño efeméride: foto de fondo + numeral romano grande + título serif
// + dedicatoria. Estilo memorial / monumento — sobrio.
//
// Tamaño export: 1080×1350.

import { renderRichText } from "@/lib/marketing/rich-text";

type Props = {
  values: Record<string, string | number>;
};

export function PostDiaAbogado({ values }: Props) {
  const photo = String(values.photo ?? "");
  const monthLabel = String(values.monthLabel ?? "");
  const year = String(values.year ?? "");
  const dayRoman = String(values.dayRoman ?? "");
  const title = String(values.title ?? "");
  const dedication = String(values.dedication ?? "");
  const excerptSize = Number(values.excerptSize ?? 24);
  const frostInset = Number(values.frostInset ?? 80);
  const frostPad = Number(values.frostPad ?? 32);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.32)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left"
    | "center"
    | "right"
    | "justify";

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: photo
          ? `url(${photo}) center/cover no-repeat`
          : "linear-gradient(135deg, #1a1208 0%, #2a1f10 50%, #1a1208 100%)",
        fontFamily: '"EB Garamond", "Cormorant Garamond", Georgia, serif',
        color: "#efe7d5",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(8,14,24,0.20) 0%, rgba(8,14,24,0.55) 100%)" }}
      />

      {/* Marco de mes/año arriba */}
      <div
        className="absolute left-0 right-0 text-center"
        style={{ top: 64 }}
      >
        <p
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 11,
            letterSpacing: "0.36em",
            color: "rgba(239,231,213,0.80)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {monthLabel}
        </p>
        <p
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: 16,
            letterSpacing: "0.30em",
            color: "rgba(184,146,84,0.85)",
            fontStyle: "italic",
            marginTop: 6,
            margin: 0,
          }}
        >
          {year}
        </p>
      </div>

      {/* Numeral romano gigante centrado */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center"
        style={{ top: 220 }}
      >
        <div
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: 280,
            fontWeight: 400,
            letterSpacing: "0.04em",
            lineHeight: 0.9,
            color: "rgba(239,231,213,0.96)",
            textShadow: "0 4px 24px rgba(0,0,0,0.45)",
          }}
        >
          {dayRoman}
        </div>
        {/* Acento dorado debajo del numeral */}
        <div
          style={{
            width: 120,
            height: 1,
            marginTop: 28,
            background:
              "linear-gradient(90deg, transparent, rgba(184,146,84,0.85), transparent)",
          }}
          aria-hidden
        />
      </div>

      {/* Frost card abajo con título + dedicatoria */}
      <div
        className="absolute"
        style={{
          left: frostInset,
          right: frostInset,
          bottom: 90,
          padding: frostPad,
          background: frostTint,
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
        }}
      >
        <h2
          style={{
            fontFamily: '"EB Garamond", Georgia, serif',
            fontSize: 38,
            lineHeight: 1.15,
            color: "#efe7d5",
            textAlign: excerptAlign,
            margin: 0,
            marginBottom: 14,
            fontWeight: 500,
          }}
        >
          {renderRichText(title)}
        </h2>
        <p
          style={{
            fontSize: excerptSize,
            lineHeight: 1.4,
            textAlign: excerptAlign,
            color: "rgba(239,231,213,0.86)",
            margin: 0,
            fontWeight: 400,
            fontStyle: "italic",
          }}
        >
          {renderRichText(dedication)}
        </p>
      </div>

      {/* Footer LDP */}
      <div
        className="absolute left-0 right-0 text-center"
        style={{ bottom: 36 }}
      >
        <span
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: 18,
            letterSpacing: "0.32em",
            color: "rgba(239,231,213,0.65)",
          }}
        >
          LDP · LEGAL ADVISORS
        </span>
      </div>
    </div>
  );
}
