"use client";

// Story 04, Día del Abogado (1080×1920).

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function StoryDiaAbogado({ values }: Props) {
  const photo = String(values.photo ?? "");
  const monthLabel = String(values.monthLabel ?? "");
  const year = String(values.year ?? "");
  const dayRoman = String(values.dayRoman ?? "");
  const title = String(values.title ?? "");
  const dedication = String(values.dedication ?? "");
  const excerptSize = Number(values.excerptSize ?? 32);
  const frostInset = Number(values.frostInset ?? 90);
  const frostPad = Number(values.frostPad ?? 40);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.32)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);

  return (
    <PhotoBg photo={photo} strength="strong" fallback="linear-gradient(135deg, #1a1208 0%, #2a1f10 50%, #1a1208 100%)">
      <div className="absolute left-0 right-0 text-center" style={{ top: 160 }}>
        <p
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 14,
            letterSpacing: "0.40em",
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
            fontSize: 20,
            letterSpacing: "0.32em",
            color: "rgba(184,146,84,0.85)",
            fontStyle: "italic",
            marginTop: 10,
            margin: 0,
          }}
        >
          {year}
        </p>
      </div>

      {/* Numeral romano gigante centrado */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ top: 360 }}>
        <div
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: 420,
            fontWeight: 400,
            letterSpacing: "0.04em",
            lineHeight: 0.9,
            color: "rgba(239,231,213,0.96)",
            textShadow: "0 6px 32px rgba(0,0,0,0.5)",
          }}
        >
          {dayRoman}
        </div>
        <GoldenLine width={160} style={{ marginTop: 36 }} />
      </div>

      {/* Frost card abajo */}
      <div
        className="absolute"
        style={{
          left: frostInset,
          right: frostInset,
          bottom: 180,
          padding: frostPad,
          background: frostTint,
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 8,
          fontFamily: font,
        }}
      >
        <h2
          style={{
            fontSize: 52,
            lineHeight: 1.15,
            color: "#efe7d5",
            textAlign: excerptAlign,
            margin: 0,
            marginBottom: 18,
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
        <ExtraBlock
          values={values}
          font={font}
          style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      <LdpFooter bottom={100} />
    </PhotoBg>
  );
}
