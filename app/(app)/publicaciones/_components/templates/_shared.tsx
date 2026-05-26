"use client";

// Bits compartidos entre todos los templates de publicaciones.

import type { ReactNode } from "react";
import { FONT_STACKS } from "@/lib/marketing/templates";
import { renderRichText } from "@/lib/marketing/rich-text";

export function resolveFont(v: string | number | undefined): string {
  const key = String(v ?? "garamond");
  return FONT_STACKS[key] ?? FONT_STACKS.garamond ?? "Georgia, serif";
}

/** Overlay neutral oscuro encima del fondo (foto) para que el texto sea
 *  legible. Más fuerte en el bottom para landing zone del texto. */
export function PhotoOverlay({ strength = "normal" }: { strength?: "normal" | "strong" }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          strength === "strong"
            ? "linear-gradient(180deg, rgba(8,14,24,0.20) 0%, rgba(8,14,24,0.55) 100%)"
            : "linear-gradient(180deg, rgba(8,14,24,0.10) 0%, rgba(8,14,24,0.35) 100%)",
      }}
    />
  );
}

/** Línea dorada decorativa (estilo bufete) */
export function GoldenLine({
  width = 80,
  className,
  style,
}: {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        width,
        height: 1,
        background:
          "linear-gradient(90deg, transparent, rgba(184,146,84,0.7), transparent)",
        ...style,
      }}
    />
  );
}

/** Bloque de "extra" — copy adicional que el usuario puede meter en cualquier
 *  template. Si está vacío, no renderiza nada (= no afecta visualmente). */
export function ExtraBlock({
  values,
  font,
  className,
  style,
}: {
  values: Record<string, string | number>;
  font: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const extra1 = String(values.extra1 ?? "").trim();
  const extra2 = String(values.extra2 ?? "").trim();
  if (!extra1 && !extra2) return null;
  return (
    <div className={className} style={{ fontFamily: font, ...style }}>
      {extra1 ? (
        <p
          style={{
            color: "rgba(239,231,213,0.92)",
            fontStyle: "italic",
            fontSize: 16,
            letterSpacing: "0.04em",
            margin: 0,
          }}
        >
          {renderRichText(extra1)}
        </p>
      ) : null}
      {extra2 ? (
        <p
          style={{
            color: "rgba(239,231,213,0.75)",
            fontSize: 13,
            letterSpacing: "0.06em",
            marginTop: extra1 ? 8 : 0,
            margin: 0,
          }}
        >
          {renderRichText(extra2)}
        </p>
      ) : null}
    </div>
  );
}

/** Footer LDP estándar al pie de los posts */
export function LdpFooter({ bottom = 36 }: { bottom?: number }) {
  return (
    <div
      className="absolute left-0 right-0 text-center"
      style={{ bottom }}
    >
      <span
        style={{
          fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
          fontSize: 16,
          letterSpacing: "0.30em",
          color: "rgba(239,231,213,0.55)",
        }}
      >
        LDP · LEGAL ADVISORS
      </span>
    </div>
  );
}

/** Background photo + neutral overlay — patrón usado en TODOS los posts */
export function PhotoBg({
  photo,
  fallback = "linear-gradient(135deg, #0a1f3b 0%, #14304f 50%, #1a3a5f 100%)",
  position = "center",
  strength = "normal",
  children,
}: {
  photo: string;
  fallback?: string;
  position?: string;
  strength?: "normal" | "strong";
  children?: ReactNode;
}) {
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: photo
          ? `url(${photo}) ${position}/cover no-repeat`
          : fallback,
        color: "#efe7d5",
      }}
    >
      <PhotoOverlay strength={strength} />
      {children}
    </div>
  );
}
