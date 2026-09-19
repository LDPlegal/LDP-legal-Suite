"use client";

// Story 03, Publicación destacada (1080×1920).

import { renderRichText } from "@/lib/marketing/rich-text";
import {
  ExtraBlock,
  GoldenLine,
  LdpFooter,
  PhotoBg,
  resolveFont,
} from "./_shared";

type Props = { values: Record<string, string | number> };

export function StoryPublicacion({ values }: Props) {
  const photo = String(values.photo ?? "");
  const authorPhoto = String(values.authorPhoto ?? "");
  const pubCategory = String(values.pubCategory ?? "");
  const pubDate = String(values.pubDate ?? "");
  const pubTitle = String(values.pubTitle ?? "");
  const pubExcerpt = String(values.pubExcerpt ?? "");
  const pubAuthor = String(values.pubAuthor ?? "");
  const pubReadTime = String(values.pubReadTime ?? "");
  const excerptSize = Number(values.excerptSize ?? 36);
  const frostInset = Number(values.frostInset ?? 80);
  const frostPad = Number(values.frostPad ?? 40);
  const frostTint = String(values.frostTint ?? "rgba(14, 31, 59, 0.50)");
  const excerptAlign = String(values.excerptAlign ?? "left") as
    | "left" | "center" | "right" | "justify";
  const font = resolveFont(values.font);
  const authorNameSize = Number(values.authorNameSize ?? 18);
  const authorPhotoSize = Number(values.authorPhotoSize ?? 110);

  return (
    <PhotoBg photo={photo} strength="strong">
      <div className="absolute left-0 right-0 text-center" style={{ top: 160 }}>
        <p
          style={{
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 13,
            letterSpacing: "0.40em",
            color: "rgba(239,231,213,0.70)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          LDP · Publicaciones
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
        {/* Eyebrow */}
        <div className="flex items-center" style={{ gap: 14, marginBottom: 22 }}>
          <span
            style={{
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 12,
              letterSpacing: "0.22em",
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
              fontSize: 12,
              letterSpacing: "0.10em",
              color: "rgba(239,231,213,0.65)",
              textTransform: "uppercase",
            }}
          >
            {pubDate}
          </span>
        </div>

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

        <GoldenLine width={60} style={{ margin: "26px 0" }} />

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

        {pubAuthor || pubReadTime ? (
          <div
            className="flex items-center"
            style={{
              gap: 18,
              marginTop: 30,
              paddingTop: 22,
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                    fontSize: Math.max(11, authorNameSize - 4),
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

      <LdpFooter bottom={130} />
    </PhotoBg>
  );
}
