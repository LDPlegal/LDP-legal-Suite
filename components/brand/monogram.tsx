// Monograma "LDP", versión SVG inspirada en el sello tipográfico de
// la firma. Se usa como elemento decorativo en hero blocks, watermark
// sutil en cards, etc.

import { cn } from "@/lib/utils";

export function LdpMonogram({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "solid";
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-none stroke-current", className)}
      aria-hidden
    >
      {/* Círculo exterior, sello clásico */}
      <circle
        cx="60"
        cy="60"
        r="56"
        strokeWidth={variant === "outline" ? "1" : "0"}
        fill={variant === "solid" ? "currentColor" : "none"}
        opacity={variant === "solid" ? "0.06" : "1"}
      />
      <circle
        cx="60"
        cy="60"
        r="56"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Círculo interior */}
      <circle
        cx="60"
        cy="60"
        r="48"
        strokeWidth="0.5"
        opacity="0.35"
      />
      {/* Letras LDP centradas con serif weight */}
      <text
        x="60"
        y="73"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="34"
        fontWeight="600"
        letterSpacing="0.04em"
        fill="currentColor"
        stroke="none"
      >
        LDP
      </text>
      {/* Línea decorativa abajo del texto */}
      <line
        x1="40"
        y1="82"
        x2="80"
        y2="82"
        strokeWidth="0.8"
        opacity="0.6"
      />
      {/* Texto pequeño abajo (Legal Suite) */}
      <text
        x="60"
        y="94"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="6"
        fontWeight="500"
        letterSpacing="0.20em"
        fill="currentColor"
        stroke="none"
      >
        LEGAL ADVISORS
      </text>
    </svg>
  );
}

// Patrón de columnas clásico (alude a arquitectura legal). Loseable como
// background decorativo. Genera 4 columnas con base + capitel mínimos.
export function ColumnsMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-current", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      {[20, 60, 100, 140, 180].map((x) => (
        <g key={x} opacity="0.5">
          {/* Capital */}
          <rect x={x - 5} y="15" width="10" height="3" />
          {/* Shaft */}
          <rect x={x - 2} y="18" width="4" height="85" />
          {/* Base */}
          <rect x={x - 6} y="103" width="12" height="4" />
        </g>
      ))}
      {/* Top entablature (architrave) */}
      <rect x="10" y="10" width="180" height="3" opacity="0.6" />
      <rect x="14" y="14" width="172" height="1" opacity="0.4" />
      {/* Stylobate (bottom platform) */}
      <rect x="10" y="107" width="180" height="3" opacity="0.6" />
    </svg>
  );
}
