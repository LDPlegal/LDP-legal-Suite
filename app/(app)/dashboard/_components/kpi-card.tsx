// KPI Card — cifra protagonista sobre superficie blanca plana.
//
// El handoff no admite animaciones de entrada ni movimiento decorativo,
// así que se retiran la entrada con framer-motion, el contador animado y
// la línea de gradiente en hover. El hover solo cambia color de borde.
//
// `color` se conserva en la API (los widgets del dashboard lo pasan) pero
// ya no pinta nada: un solo acento por pantalla.

import Link from "next/link";
import { Icon } from "@/components/ui/icon";

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

// Equivalentes sólidos de esquinas rectas en Material Symbols Sharp.
const ICON_MAP: Record<KpiIconName, string> = {
  briefcase: "work",
  users: "groups",
  clock: "schedule",
  receipt: "receipt_long",
  calendar: "calendar_month",
  listChecks: "checklist",
  fileText: "description",
  checkSquare: "task_alt",
  sparkles: "auto_awesome",
};

export type KpiColor = "blue" | "teal" | "amber" | "rose" | "violet" | "emerald";

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
  /** Se acepta por compatibilidad; ya no hay entrada escalonada. */
  delay?: number;
};

function formatNumeric(n: KpiNumeric): string {
  const body = n.value.toLocaleString("es-DO", {
    minimumFractionDigits: n.decimals ?? 0,
    maximumFractionDigits: n.decimals ?? 0,
  });
  return `${n.prefix ?? ""}${body}${n.suffix ?? ""}`;
}

export function KpiCard({
  label,
  hint,
  href,
  iconName,
  numeric,
  displayValue,
}: KpiCardProps) {
  return (
    <Link href={href} className="group block">
      <div className="relative overflow-hidden rounded-[4px] border border-[#DFE0DC] bg-white transition-colors duration-150 ease-out group-hover:border-[#C9CCC5]">
        <div className="p-[18px]">
          <div className="flex items-start justify-between gap-3">
            <p className="microlabel">{label}</p>
            <Icon
              name={ICON_MAP[iconName]}
              size={18}
              className="text-[#9C9D96] transition-colors group-hover:text-[#0F4C81]"
            />
          </div>
          <p className="stat-number tabular mt-3 text-[30px] leading-none text-[#0B1929]">
            {numeric ? formatNumeric(numeric) : (displayValue ?? "—")}
          </p>
          <p className="mt-2 text-[11.5px] text-[#8E8F89]">{hint}</p>
        </div>
      </div>
    </Link>
  );
}
