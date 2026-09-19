"use client";

// Story 01, Presentación (1080×1920). Versión vertical.

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function StoryPresentacion({ values }: Props) {
  const photo = String(values.photo ?? "");
  const statement = String(values.statement ?? "");
  const value1 = String(values.value1 ?? "");
  const value2 = String(values.value2 ?? "");
  const value3 = String(values.value3 ?? "");
  const excerptSize = Number(values.excerptSize ?? 48);
  const frostInset = Number(values.frostInset ?? 90);
  const frostPad = Number(values.frostPad ?? 42);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.32)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);

  return (
    <PhotoBg photo={photo}>
      {/* Wordmark superior, más generoso por la altura extra */}
      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ paddingTop: 200 }}>
        <div
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: 132,
            fontWeight: 500,
            letterSpacing: "0.18em",
            color: "#efe7d5",
            textShadow: "0 4px 18px rgba(0,0,0,0.45)",
            lineHeight: 1,
          }}
        >
          LDP
        </div>
        <div
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 14,
            letterSpacing: "0.40em",
            color: "rgba(239,231,213,0.75)",
            textTransform: "uppercase",
            marginTop: 16,
          }}
        >
          Legal Advisors
        </div>
        <GoldenLine width={100} style={{ marginTop: 24 }} />
      </div>

      {/* Frost card central */}
      <div
        className="absolute"
        style={{
          left: frostInset,
          right: frostInset,
          top: "55%",
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
          {renderRichText(statement)}
        </p>
        <ExtraBlock
          values={values}
          font={font}
          style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      {/* Triada de valores abajo */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center"
        style={{ bottom: 220, gap: 12 }}
      >
        {[value1, value2, value3].filter(Boolean).map((v, i) => (
          <span
            key={i}
            style={{
              fontFamily: '"EB Garamond", Georgia, serif',
              fontSize: 30,
              letterSpacing: "0.14em",
              color: "rgba(239,231,213,0.92)",
              fontStyle: "italic",
            }}
          >
            {v}
          </span>
        ))}
      </div>

      <LdpFooter bottom={130} />
    </PhotoBg>
  );
}
