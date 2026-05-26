"use client";

// Post 01 — Presentación
//
// Diseño: foto de fondo full-bleed + frost card centrado vertical con
// declaración principal en serif + tres "valores" como triada con
// separadores. Estilo editorial bufete (Garamond + cursiva azul).
//
// Tamaño export: 1080×1350.

import { renderRichText } from "@/lib/marketing/rich-text";

type Props = {
  values: Record<string, string | number>;
};

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
          : "linear-gradient(135deg, #0a1f3b 0%, #14304f 50%, #1a3a5f 100%)",
        fontFamily: '"EB Garamond", "Cormorant Garamond", Georgia, serif',
        color: "#efe7d5",
      }}
    >
      {/* Overlay oscuro general para legibilidad */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(8,14,24,0.10) 0%, rgba(8,14,24,0.35) 100%)" }}
      />

      {/* Wordmark superior — LDP en serif grande */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center"
        style={{ paddingTop: 76 }}
      >
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
      <div
        className="absolute left-0 right-0 flex justify-center"
        style={{ top: 180 }}
      >
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
      <div
        className="absolute left-1/2 -translate-x-1/2 h-px"
        style={{
          top: 224,
          width: 80,
          background:
            "linear-gradient(90deg, transparent, rgba(184,146,84,0.7), transparent)",
        }}
        aria-hidden
      />

      {/* Frost card central con la declaración */}
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
      </div>

      {/* Valores en triada abajo */}
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

      {/* Footer mínimo */}
      <div
        className="absolute left-0 right-0 text-center"
        style={{ bottom: 48 }}
      >
        <span
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 10,
            letterSpacing: "0.30em",
            color: "rgba(239,231,213,0.45)",
            textTransform: "uppercase",
          }}
        >
          ldplegal.com.do
        </span>
      </div>
    </div>
  );
}
