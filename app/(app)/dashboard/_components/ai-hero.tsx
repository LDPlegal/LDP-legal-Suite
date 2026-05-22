"use client";

// Hero del dashboard — bloque navy sólido editorial. Inspiración: la
// cabecera de un memorandum legal o el letterhead de la firma. Texto
// en serif para el slogan, monograma LDP a la derecha como sello.
// Sin gradientes vibrantes, sin orbes, sin animaciones tontas. Solo
// color profundo + tipografía con peso histórico.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LdpMonogram, ColumnsMotif } from "@/components/brand/monogram";
import { useModKey } from "@/lib/hooks/use-platform";

export function AiHero({
  ctaHref = "/casos",
  pendingPromptsCount,
}: {
  ctaHref?: string;
  pendingPromptsCount?: number;
}) {
  const mod = useModKey();
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#051D33] text-white shadow-[0_8px_30px_-12px_rgba(5,13,26,0.4)]">
      {/* Base wash sutil — navy slightly lighter desde la esquina top-left */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #0A2B47 0%, #051D33 50%, #030F1A 100%)",
        }}
      />

      {/* Columns motif sutil arriba a la derecha — alude a arquitectura legal */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-3 right-32 h-24 w-72 text-white opacity-[0.07]"
      >
        <ColumnsMotif className="h-full w-full" />
      </div>

      {/* Línea fina dorada de acento (legal motif) abajo */}
      <div
        aria-hidden
        className="absolute inset-x-8 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(184,146,84,0.7), rgba(184,146,84,0.4) 60%, transparent)",
        }}
      />

      {/* Grain noise sutil */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center md:gap-12 md:p-12">
        <div className="space-y-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/55">
            LDP Legal Advisors · Asistente
          </p>
          <h2
            className="text-[26px] leading-[1.15] tracking-tight text-white md:text-[32px]"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 400,
            }}
          >
            Rigor técnico, creatividad jurídica
            <br />
            <span className="italic text-white/75">y un copiloto siempre listo.</span>
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-white/70">
            Tu asistente está disponible dentro de cada expediente. Pedile
            que lea un caso, redacte un acta, prepare una demanda o
            envíe un correo al cliente. Apretá{" "}
            <KeyTag>{mod}</KeyTag>
            <span className="mx-0.5 text-white/45">+</span>
            <KeyTag>J</KeyTag>{" "}
            dentro de cualquier caso.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={ctaHref}
              className="group inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-[#051D33] press transition-colors hover:bg-[#F6F4EF]"
            >
              Ir a un expediente
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {pendingPromptsCount && pendingPromptsCount > 0 ? (
              <p className="text-[11px] text-white/55">
                {pendingPromptsCount}{" "}
                {pendingPromptsCount === 1 ? "sugerencia" : "sugerencias"} pendientes
              </p>
            ) : null}
          </div>
        </div>

        {/* Monograma "sello" a la derecha — elemento clásico de bufete */}
        <div className="relative hidden h-40 w-40 shrink-0 md:block">
          <LdpMonogram className="h-full w-full text-white/35" variant="outline" />
        </div>
      </div>
    </div>
  );
}

function KeyTag({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-md border border-white/20 bg-white/8 px-1.5 text-[10px] font-medium text-white/85">
      {children}
    </kbd>
  );
}
