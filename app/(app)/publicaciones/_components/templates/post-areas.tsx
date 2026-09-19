"use client";

// Post 02, Áreas de práctica (1080×1350).
//
// Foto de fondo + frost card central con intro en serif arriba, separador
// dorado, y 4 áreas listadas con guion largo. Estilo "carta de servicios".

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function PostAreas({ values }: Props) {
  const photo = String(values.photo ?? "");
  const intro = String(values.intro ?? "");
  const areas = [
    String(values.area1 ?? ""),
    String(values.area2 ?? ""),
    String(values.area3 ?? ""),
    String(values.area4 ?? ""),
  ].filter(Boolean);
  const excerptSize = Number(values.excerptSize ?? 32);
  const frostInset = Number(values.frostInset ?? 80);
  const frostPad = Number(values.frostPad ?? 36);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.32)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);

  return (
    <PhotoBg photo={photo}>
      {/* Eyebrow */}
      <div className="absolute left-0 right-0 text-center" style={{ top: 80 }}>
        <p
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 11,
            letterSpacing: "0.36em",
            color: "rgba(239,231,213,0.75)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Áreas de Práctica
        </p>
        <p
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 18,
            letterSpacing: "0.30em",
            color: "rgba(184,146,84,0.85)",
            fontStyle: "italic",
            marginTop: 8,
            margin: 0,
          }}
        >
          MMXXVI
        </p>
      </div>

      {/* Frost card central */}
      <div
        className="absolute"
        style={{
          left: frostInset,
          right: frostInset,
          top: "50%",
          transform: "translateY(-50%)",
          padding: frostPad,
          background: frostTint,
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          fontFamily: font,
        }}
      >
        {/* Intro */}
        <p
          style={{
            fontSize: excerptSize,
            lineHeight: 1.28,
            textAlign: excerptAlign,
            color: "#efe7d5",
            margin: 0,
            fontWeight: 400,
          }}
        >
          {renderRichText(intro)}
        </p>

        <GoldenLine width={64} style={{ margin: "24px auto" }} />

        {/* Áreas listadas */}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {areas.map((a, i) => (
            <li
              key={i}
              style={{
                fontSize: Math.max(18, Math.round(excerptSize * 0.72)),
                lineHeight: 1.3,
                color: "rgba(239,231,213,0.95)",
                textAlign: excerptAlign,
                fontWeight: 400,
                display: "flex",
                alignItems: "baseline",
                gap: 14,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: "rgba(184,146,84,0.85)",
                  fontSize: Math.max(14, Math.round(excerptSize * 0.5)),
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontWeight: 500,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ flex: 1 }}>{renderRichText(a)}</span>
            </li>
          ))}
        </ul>

        <ExtraBlock
          values={values}
          font={font}
          style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      <LdpFooter bottom={48} />
    </PhotoBg>
  );
}
