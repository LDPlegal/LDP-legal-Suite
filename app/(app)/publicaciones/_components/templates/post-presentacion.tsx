"use client";

// Post 01, Presentación (1080×1350).

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function PostPresentacion({ values }: Props) {
  const photo = String(values.photo ?? "");
  const statement = String(values.statement ?? "");
  const value1 = String(values.value1 ?? "");
  const value2 = String(values.value2 ?? "");
  const value3 = String(values.value3 ?? "");
  const excerptSize = Number(values.excerptSize ?? 36);
  const frostInset = Number(values.frostInset ?? 80);
  const frostPad = Number(values.frostPad ?? 34);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.32)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);

  return (
    <PhotoBg photo={photo}>
      {/* Wordmark superior */}
      <div className="absolute left-0 right-0 flex justify-center" style={{ paddingTop: 76 }}>
        <div
          style={{
            fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
            fontSize: 88,
            fontWeight: 500,
            letterSpacing: "0.18em",
            color: "#efe7d5",
            textShadow: "0 2px 12px rgba(0,0,0,0.4)",
            lineHeight: 1,
          }}
        >
          LDP
        </div>
      </div>
      <div className="absolute left-0 right-0 flex justify-center" style={{ top: 180 }}>
        <div
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 11,
            letterSpacing: "0.36em",
            color: "rgba(239,231,213,0.75)",
            textTransform: "uppercase",
          }}
        >
          Legal Advisors
        </div>
      </div>
      <GoldenLine
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: 224 }}
      />

      {/* Frost card con la declaración */}
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
          style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)" }}
        />
      </div>

      {/* Triada de valores */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center"
        style={{ bottom: 110, gap: 32 }}
      >
        {[value1, value2, value3].filter(Boolean).map((v, i, arr) => (
          <div key={i} className="flex items-center" style={{ gap: 32 }}>
            <span
              style={{
                fontFamily: '"EB Garamond", Georgia, serif',
                fontSize: 22,
                letterSpacing: "0.10em",
                color: "rgba(239,231,213,0.92)",
                fontStyle: "italic",
              }}
            >
              {v}
            </span>
            {i < arr.length - 1 ? (
              <span
                aria-hidden
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "rgba(184,146,84,0.7)",
                }}
              />
            ) : null}
          </div>
        ))}
      </div>

      <LdpFooter bottom={48} />
    </PhotoBg>
  );
}
