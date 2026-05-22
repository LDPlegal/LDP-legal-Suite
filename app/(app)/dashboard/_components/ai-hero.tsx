"use client";

// AI Hero — el "wow card" del dashboard. Banner premium con gradient
// vibrante, orbes de luz animados, y un CTA prominente para abrir el
// asistente IA. Inspirado en pantallas de bienvenida tipo Apple
// Intelligence / Linear / Vercel.

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Wand2, MessageSquareText } from "lucide-react";

export function AiHero({
  ctaHref = "/casos",
  pendingPromptsCount,
}: {
  ctaHref?: string;
  pendingPromptsCount?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl"
    >
      {/* Base gradient */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(135deg, #051D33 0%, #0F4C81 40%, #1E6FBA 80%, #14B8A6 100%)",
        }}
      />
      {/* Orbe 1 — teal floating top-right */}
      <motion.div
        aria-hidden
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(20,184,166,0.65), transparent 70%)",
        }}
      />
      {/* Orbe 2 — brand-blue floating bottom-left */}
      <motion.div
        aria-hidden
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.45, 0.6, 0.45],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -bottom-32 -left-24 -z-10 h-80 w-80 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(30,111,186,0.65), transparent 70%)",
        }}
      />
      {/* Grain noise */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")",
        }}
      />
      {/* Decorative columns (legal motif) at bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, white 0 1px, transparent 1px 28px)",
          maskImage: "linear-gradient(0deg, white 0%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(0deg, white 0%, transparent 100%)",
        }}
      />

      <div className="relative flex flex-col gap-5 p-7 md:flex-row md:items-center md:justify-between md:gap-8 md:p-9">
        <div className="flex-1 space-y-3 text-white">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/70">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Asistente del expediente</span>
          </div>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight md:text-[28px]">
            Tu copiloto legal está listo.
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-white/80">
            Pedile que lea un expediente, redacte un acta, prepare una
            demanda o mande un correo al cliente — sin salir del caso.
            Apretá <KeyTag>Cmd</KeyTag>+<KeyTag>J</KeyTag> en cualquier expediente.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link
              href={ctaHref}
              className="group inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-primary press shadow-[0_4px_14px_rgba(0,0,0,0.20)] transition-transform hover:scale-[1.02]"
            >
              Abrir un caso
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="text-[11px] text-white/65">
              {pendingPromptsCount && pendingPromptsCount > 0
                ? `${pendingPromptsCount} sugerencias esperándote`
                : "Listo cuando quieras"}
            </span>
          </div>
        </div>

        {/* Visual element a la derecha — cards flotantes que aluden a
            documentos / chat / wand. Decorativo. */}
        <div className="relative hidden h-44 w-64 shrink-0 md:block">
          {/* Card flotante 1 — chat IA */}
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: [-4, 4, -4] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-2 top-0 flex w-52 items-start gap-2 rounded-xl bg-white/12 p-3 backdrop-blur-md ring-1 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.30)]"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-400/30 text-teal-100">
              <MessageSquareText className="h-3.5 w-3.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] text-white/70">Asistente</p>
              <p className="text-[11px] font-medium text-white line-clamp-2">
                Generé el borrador con base en los estatutos…
              </p>
            </div>
          </motion.div>
          {/* Card flotante 2 — wand magic */}
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: [4, -4, 4] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-16 top-20 flex w-48 items-center gap-2 rounded-xl bg-white/12 p-3 backdrop-blur-md ring-1 ring-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.30)]"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-400/30 text-amber-100">
              <Wand2 className="h-3.5 w-3.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] text-white/70">Acta generada</p>
              <p className="text-[11px] font-medium text-white">.docx listo</p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function KeyTag({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-md border border-white/25 bg-white/10 px-1.5 text-[10px] font-medium text-white/90">
      {children}
    </kbd>
  );
}
