"use client";

// KPI Card vibrante: gradiente único por color, icono grande translúcido,
// número animado, hover con lift suave. Cada color tiene su personalidad
// (azul = casos, teal = clientes, ámbar = tiempos, rojo = por cobrar).
//
// IMPORTANTE: como este componente cruza la frontera server/client, no
// podemos recibir el icono como prop (los componentes de Lucide son
// funciones y no son serializables). Resolvemos el icono adentro a
// partir de un string key.

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  ListChecks,
  Receipt,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnimatedCounter } from "./animated-counter";

export type KpiIconName =
  | "briefcase"
  | "users"
  | "clock"
  | "receipt"
  | "calendar"
  | "listChecks"
  | "fileText"
  | "checkSquare"
  | "sparkles";

const ICON_MAP: Record<KpiIconName, LucideIcon> = {
  briefcase: Briefcase,
  users: Users,
  clock: Clock,
  receipt: Receipt,
  calendar: Calendar,
  listChecks: ListChecks,
  fileText: FileText,
  checkSquare: CheckSquare,
  sparkles: Sparkles,
};

export type KpiColor = "blue" | "teal" | "amber" | "rose" | "violet" | "emerald";

const COLOR_STYLES: Record<
  KpiColor,
  {
    bgGradient: string;
    iconGlow: string;
    iconColor: string;
    accentLine: string;
  }
> = {
  blue: {
    bgGradient: "from-blue-500/[0.12] via-blue-500/[0.06] to-transparent",
    iconGlow: "bg-blue-500/15 ring-blue-500/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    accentLine: "from-blue-500 to-blue-600",
  },
  teal: {
    bgGradient: "from-teal-500/[0.14] via-teal-500/[0.06] to-transparent",
    iconGlow: "bg-teal-500/15 ring-teal-500/20",
    iconColor: "text-teal-600 dark:text-teal-400",
    accentLine: "from-teal-500 to-teal-600",
  },
  amber: {
    bgGradient: "from-amber-500/[0.14] via-amber-500/[0.06] to-transparent",
    iconGlow: "bg-amber-500/15 ring-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    accentLine: "from-amber-500 to-amber-600",
  },
  rose: {
    bgGradient: "from-rose-500/[0.12] via-rose-500/[0.06] to-transparent",
    iconGlow: "bg-rose-500/15 ring-rose-500/20",
    iconColor: "text-rose-600 dark:text-rose-400",
    accentLine: "from-rose-500 to-rose-600",
  },
  violet: {
    bgGradient: "from-violet-500/[0.12] via-violet-500/[0.06] to-transparent",
    iconGlow: "bg-violet-500/15 ring-violet-500/20",
    iconColor: "text-violet-600 dark:text-violet-400",
    accentLine: "from-violet-500 to-violet-600",
  },
  emerald: {
    bgGradient: "from-emerald-500/[0.12] via-emerald-500/[0.06] to-transparent",
    iconGlow: "bg-emerald-500/15 ring-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    accentLine: "from-emerald-500 to-emerald-600",
  },
};

export type KpiNumeric = {
  type: "number";
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
};

export type KpiCardProps = {
  label: string;
  hint: string;
  href: string;
  iconName: KpiIconName;
  color: KpiColor;
  numeric?: KpiNumeric;
  displayValue?: string;
  delay?: number;
};

export function KpiCard({
  label,
  hint,
  href,
  iconName,
  color,
  numeric,
  displayValue,
  delay = 0,
}: KpiCardProps) {
  const c = COLOR_STYLES[color];
  const Icon = ICON_MAP[iconName];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      }}
    >
      <Link href={href} className="group relative block">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card backdrop-blur-xl transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[var(--glass-shadow-lg)]">
          {/* Tinted gradient layer */}
          <div
            className={`absolute inset-0 bg-gradient-to-br ${c.bgGradient} opacity-100`}
            aria-hidden
          />
          {/* Top highlight + bottom accent line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/20" />
          <div
            className={`absolute inset-x-4 bottom-0 h-px bg-gradient-to-r ${c.accentLine} opacity-0 transition-opacity duration-300 group-hover:opacity-70`}
          />

          <div className="relative p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                  {label}
                </p>
                <p className="stat-number text-[34px] leading-none">
                  {numeric ? (
                    <AnimatedCounter
                      value={numeric.value}
                      prefix={numeric.prefix}
                      suffix={numeric.suffix}
                      decimals={numeric.decimals}
                    />
                  ) : (
                    displayValue ?? "—"
                  )}
                </p>
              </div>
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${c.iconGlow}`}
              >
                <Icon className={`h-5 w-5 ${c.iconColor}`} />
              </span>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground/90">{hint}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
