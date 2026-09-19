"use client";

// Post 03, Publicación destacada (1080×1350).
//
// Foto de fondo + frost card grande con categoría/fecha en eyebrow,
// título serif, extracto en italic, separador, autor con foto circular.

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function PostPublicacion({ values }: Props) {
  const photo = String(values.photo ?? "");
  const authorPhoto = String(values.authorPhoto ?? "");
  const pubCategory = String(values.pubCategory ?? "");
  const pubDate = String(values.pubDate ?? "");
  const pubTitle = String(values.pubTitle ?? "");
  const pubExcerpt = String(values.pubExcerpt ?? "");
  const pubAuthor = String(values.pubAuthor ?? "");
  const pubReadTime = String(values.pubReadTime ?? "");
  const excerptSize = Number(values.excerptSize ?? 30);
  const frostInset = Number(values.frostInset ?? 80);
  const frostPad = Number(values.frostPad ?? 32);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.45)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);
  const authorNameSize = Number(values.authorNameSize ?? 15);
  const authorPhotoSize = Number(values.authorPhotoSize ?? 92);

  return (
    <PhotoBg photo={photo} strength="strong">
      {/* Wordmark superior */}
      <div className="absolute left-0 right-0 text-center" style={{ top: 64 }}>
        <p
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 10,
            letterSpacing: "0.36em",
            color: "rgba(239,231,213,0.70)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          LDP · Publicaciones
        </p>
      </div>

      {/* Frost card */}
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
        {/* Eyebrow: categoría + fecha */}
        <div className="flex items-center" style={{ gap: 12, marginBottom: 18 }}>
          <span
            style={{
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10,
              letterSpacing: "0.20em",
              color: "rgba(184,146,84,0.95)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {pubCategory}
          </span>
          <span
            aria-hidden
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "rgba(239,231,213,0.5)",
            }}
          />
          <span
            style={{
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10,
              letterSpacing: "0.10em",
              color: "rgba(239,231,213,0.65)",
              textTransform: "uppercase",
            }}
          >
            {pubDate}
          </span>
        </div>

        {/* Título */}
        <h2
          style={{
            fontSize: Math.round(excerptSize * 1.4),
            lineHeight: 1.18,
            color: "#efe7d5",
            textAlign: excerptAlign,
            margin: 0,
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          {renderRichText(pubTitle)}
        </h2>

        <GoldenLine width={48} style={{ margin: "20px 0" }} />

        {/* Extracto */}
        <p
          style={{
            fontSize: excerptSize,
            lineHeight: 1.5,
            textAlign: excerptAlign,
            color: "rgba(239,231,213,0.85)",
            margin: 0,
            fontWeight: 400,
            fontStyle: "italic",
          }}
        >
          {renderRichText(pubExcerpt)}
        </p>

        {/* Author meta */}
        {pubAuthor || pubReadTime ? (
          <div
            className="flex items-center"
            style={{
              gap: 14,
              marginTop: 26,
              paddingTop: 18,
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {authorPhoto ? (
              <span
                style={{
                  display: "inline-block",
                  width: authorPhotoSize,
                  height: authorPhotoSize,
                  borderRadius: "50%",
                  background: `url(${authorPhoto}) center/cover`,
                  border: "2px solid rgba(184,146,84,0.5)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.30)",
                  flexShrink: 0,
                }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <p
                style={{
                  fontFamily: '"EB Garamond", Georgia, serif',
                  fontSize: authorNameSize,
                  color: "rgba(239,231,213,0.95)",
                  margin: 0,
                  letterSpacing: "0.02em",
                  fontWeight: 500,
                }}
              >
                {pubAuthor}
              </p>
              {pubReadTime ? (
                <p
                  style={{
                    fontFamily: "ui-sans-serif, system-ui, sans-serif",
                    fontSize: Math.max(9, authorNameSize - 4),
                    color: "rgba(239,231,213,0.55)",
                    margin: 0,
                    letterSpacing: "0.06em",
                  }}
                >
                  {pubReadTime}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <ExtraBlock values={values} font={font} style={{ marginTop: 18 }} />
      </div>

      <LdpFooter bottom={48} />
    </PhotoBg>
  );
}
