"use client";

// Sidebar premium — glass surface con grupos, indicador animado (layoutId),
// avatar del user, y un CTA destacado para abrir el asistente IA.
// Inspirado en Apple sidebars + el monograma LDP (escala de balanza).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  LayoutDashboard,
  Receipt,
  Scale,
  Settings,
  ShieldAlert,
  ListChecks,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// Grupos para dar jerarquía visual a la navegación.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Resumen",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { href: "/casos", label: "Casos", icon: Briefcase },
      { href: "/tareas", label: "Tareas", icon: ListChecks },
      { href: "/calendario", label: "Calendario", icon: Calendar },
      { href: "/documentos", label: "Documentos", icon: FileText },
    ],
  },
  {
    label: "Gente",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/conflictos", label: "Conflictos", icon: ShieldAlert },
    ],
  },
  {
    label: "Tiempo y dinero",
    items: [
      { href: "/tiempos", label: "Tiempos", icon: Clock },
      { href: "/facturacion", label: "Facturación", icon: Receipt },
      { href: "/reportes", label: "Reportes", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  partner: "Socio",
  lawyer: "Abogado/a",
  paralegal: "Paralegal",
  tester: "Tester",
};

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar({
  firmName,
  user,
}: {
  firmName: string;
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col text-sidebar-foreground",
        "bg-[var(--sidebar)] backdrop-blur-2xl",
        "border-r border-sidebar-border",
        "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-[72px]" : "w-[260px]",
      )}
    >
      {/* Decorative columns pattern at top — legal motif sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 22px)",
          maskImage: "linear-gradient(180deg, currentColor 0%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, currentColor 0%, transparent 100%)",
        }}
      />

      {/* Brand + collapse toggle */}
      <div className="relative flex h-16 items-center justify-between border-b border-sidebar-border px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-sidebar-accent/40"
        >
          <span
            className={cn(
              "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground overflow-hidden",
              "bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))]",
              "shadow-[0_4px_12px_rgba(15,76,129,0.35),inset_0_1px_0_rgba(255,255,255,0.30)]",
            )}
          >
            {/* Specular highlight — efecto vidrio brillante */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(ellipse 100% 50% at 30% 0%, rgba(255,255,255,0.4), transparent 60%)",
              }}
            />
            <Scale className="relative h-5 w-5 drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]" />
          </span>
          {!collapsed ? (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="min-w-0 leading-tight"
            >
              <p className="truncate text-[13px] font-semibold tracking-tight">
                {firmName}
              </p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                Legal Suite
              </p>
            </motion.div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground press transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* AI Assistant CTA — el botón hero del sidebar */}
      <div className="px-3 pt-3">
        <Link
          href="/casos"
          className={cn(
            "group relative flex items-center gap-2.5 overflow-hidden rounded-xl press",
            "bg-[linear-gradient(135deg,#0F4C81,#1E6FBA_55%,#14B8A6)]",
            "px-3 py-2.5 text-white shadow-[0_4px_14px_rgba(15,76,129,0.30),inset_0_1px_0_rgba(255,255,255,0.18)]",
            "transition-all hover:shadow-[0_6px_20px_rgba(15,76,129,0.45),inset_0_1px_0_rgba(255,255,255,0.22)]",
            collapsed ? "justify-center" : "",
          )}
          title={collapsed ? "Asistente IA" : undefined}
        >
          {/* Sparkle floating effect */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60"
            style={{ background: "radial-gradient(circle, #5EEAD4, transparent 70%)" }}
          />
          <Sparkles className="relative h-4 w-4 shrink-0 drop-shadow-[0_1px_0_rgba(0,0,0,0.20)]" />
          {!collapsed ? (
            <div className="relative min-w-0 leading-tight">
              <p className="text-[13px] font-semibold tracking-tight">
                Asistente IA
              </p>
              <p className="text-[10px] text-white/75">Cmd+J en cualquier caso</p>
            </div>
          ) : null}
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.10em] text-muted-foreground/65">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                        "transition-[color,background] duration-200",
                        active
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      {/* Indicador animado — pill que se desliza entre items */}
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          aria-hidden
                          className="absolute inset-0 rounded-lg bg-sidebar-accent shadow-[inset_0_0_0_1px_rgba(15,76,129,0.10)] dark:shadow-[inset_0_0_0_1px_rgba(77,147,199,0.20)]"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      ) : null}
                      {/* Barra brand a la izquierda en activo */}
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active-bar"
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[linear-gradient(180deg,var(--color-brand-500),var(--color-brand-700))]"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      ) : null}
                      <Icon
                        className={cn(
                          "relative h-4 w-4 shrink-0 transition-transform duration-200",
                          active
                            ? "text-primary"
                            : "group-hover:scale-110 group-hover:rotate-[-4deg]",
                        )}
                      />
                      {!collapsed ? (
                        <span className="relative flex-1 truncate">
                          {item.label}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User card en footer */}
      <div className="border-t border-sidebar-border p-3">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl press",
            !collapsed && "p-1.5 hover:bg-sidebar-accent/40 transition-colors",
          )}
        >
          <span
            className={cn(
              "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full",
              "bg-[linear-gradient(135deg,#1E6FBA,#0F4C81_60%,#14B8A6)]",
              "text-[12px] font-semibold text-white",
              "shadow-[0_2px_8px_rgba(15,76,129,0.25),inset_0_1px_0_rgba(255,255,255,0.25)]",
              "ring-2 ring-background/50",
            )}
          >
            {/* Specular highlight para que el avatar parezca vidrio */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 100% 60% at 30% 0%, rgba(255,255,255,0.35), transparent 60%)",
              }}
            />
            <span className="relative">{initialsOf(user.name)}</span>
          </span>
          <AnimatePresence>
            {!collapsed ? (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="min-w-0 leading-tight"
              >
                <p className="truncate text-[12px] font-semibold tracking-tight">
                  {user.name}
                </p>
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  <span>{ROLE_LABEL[user.role] ?? user.role}</span>
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}
