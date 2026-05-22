"use client";

// AI Hero sobrio — sin gradientes vibrantes, sin orbes, sin cards
// flotantes. Tipografía protagonista, monograma decorativo discreto.
// Inspiración: firmas como Latham & Watkins, sitios serios como Stripe
// o Linear. La IA es una herramienta — no la mostramos como un truco.

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function AiHero({
  ctaHref = "/casos",
  pendingPromptsCount,
}: {
  ctaHref?: string;
  pendingPromptsCount?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-[var(--card)] backdrop-blur-xl shadow-[var(--glass-shadow)]">
      {/* Acento sutil — línea brand vertical a la izquierda */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-[linear-gradient(180deg,var(--color-brand-700),var(--color-brand-500))]"
      />

      <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:gap-12 md:p-8">
        <div className="space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Asistente
          </p>
          <h2
            className="text-[22px] font-semibold leading-tight tracking-tight text-foreground md:text-2xl"
          >
            Tu copiloto legal está disponible en cada expediente.
          </h2>
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Pedile que lea un caso, redacte un acta, prepare una demanda
            o envíe un correo. Apretá <KeyTag>Cmd</KeyTag>
            <span className="mx-0.5 text-muted-foreground/60">+</span>
            <KeyTag>J</KeyTag> dentro de cualquier expediente para abrirlo.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link
            href={ctaHref}
            className="group inline-flex items-center gap-2 rounded-lg border border-border bg-[var(--glass-bg-strong)] px-4 py-2 text-sm font-medium text-foreground press transition-colors hover:bg-accent/60"
          >
            Ir a un caso
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          {pendingPromptsCount && pendingPromptsCount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {pendingPromptsCount}{" "}
              {pendingPromptsCount === 1 ? "sugerencia" : "sugerencias"} pendientes
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function KeyTag({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-md border border-border bg-muted/50 px-1.5 text-[10px] font-medium text-foreground/80">
      {children}
    </kbd>
  );
}
