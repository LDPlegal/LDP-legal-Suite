"use client";

// KPI Card sobria — neutra, sin gradientes pastel ni glow effects. El
// número es el protagonista. Un acento mínimo (línea brand de 2px en
// la parte superior cuando hover) marca interactividad sin gritar.
//
// El icono es discreto, monocromático, no decorativo.

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

// Color se mantiene como prop pero solo se usa para el acento sutil
// (la línea brand del top en hover). Los KPIs son fundamentalmente
// neutros — el color es indicativo, no decorativo.
export type KpiColor = "blue" | "teal" | "amber" | "rose" | "violet" | "emerald";

const ACCENT_LINE: Record<KpiColor, string> = {
  blue: "from-blue-500/60 to-blue-600/60",
  teal: "from-teal-500/60 to-teal-600/60",
  amber: "from-amber-500/60 to-amber-600/60",
  rose: "from-rose-500/60 to-rose-600/60",
  violet: "from-violet-500/60 to-violet-600/60",
  emerald: "from-emerald-500/60 to-emerald-600/60",
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
  const Icon = ICON_MAP[iconName];
  const accent = ACCENT_LINE[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      }}
    >
      <Link href={href} className="group block">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card backdrop-blur-xl transition-colors duration-200 group-hover:border-border/80 group-hover:bg-[var(--glass-bg-strong)]">
          {/* Acento sutil arriba — aparece solo en hover */}
          <div
            className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
            aria-hidden
          />

          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {label}
              </p>
              <Icon
                className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground/70"
                aria-hidden
              />
            </div>
            <p className="mt-3 stat-number text-[30px] leading-none text-foreground">
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
            <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
