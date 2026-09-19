"use client";

// Story 02, Áreas (1080×1920).

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function StoryAreas({ values }: Props) {
  const photo = String(values.photo ?? "");
  const intro = String(values.intro ?? "");
  const areas = [
    String(values.area1 ?? ""),
    String(values.area2 ?? ""),
    String(values.area3 ?? ""),
    String(values.area4 ?? ""),
  ].filter(Boolean);
  const excerptSize = Number(values.excerptSize ?? 42);
  const frostInset = Number(values.frostInset ?? 90);
  const frostPad = Number(values.frostPad ?? 44);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.32)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);

  return (
    <PhotoBg photo={photo}>
      <div className="absolute left-0 right-0 text-center" style={{ top: 180 }}>
        <p
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 14,
            letterSpacing: "0.40em",
            color: "rgba(239,231,213,0.78)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Áreas de Práctica
        </p>
        <p
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 22,
            letterSpacing: "0.30em",
            color: "rgba(184,146,84,0.85)",
            fontStyle: "italic",
            marginTop: 10,
            margin: 0,
          }}
        >
          MMXXVI
        </p>
      </div>

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
          borderRadius: 8,
          fontFamily: font,
        }}
      >
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

        <GoldenLine width={80} style={{ margin: "32px auto" }} />

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {areas.map((a, i) => (
            <li
              key={i}
              style={{
                fontSize: Math.max(24, Math.round(excerptSize * 0.72)),
                lineHeight: 1.3,
                color: "rgba(239,231,213,0.95)",
                textAlign: excerptAlign,
                fontWeight: 400,
                display: "flex",
                alignItems: "baseline",
                gap: 18,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: "rgba(184,146,84,0.85)",
                  fontSize: Math.max(18, Math.round(excerptSize * 0.5)),
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
          style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      <LdpFooter bottom={130} />
    </PhotoBg>
  );
}
