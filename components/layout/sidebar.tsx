"use client";

// Sidebar sobrio — tipografía protagonista, grupos jerárquicos, color
// usado solo para indicar estado (no decoración). Sin gradientes
// vibrantes, sin specular highlights ni patterns flashy. Mismo nivel
// de refinamiento de un buen dashboard financiero o legal serio.

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
  LogOut,
  Megaphone,
  Receipt,
  Scale,
  Settings,
  ShieldAlert,
  ListChecks,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/_actions/auth/logout";
import { cn } from "@/lib/utils";
import { useModKey } from "@/lib/hooks/use-platform";
import { useSidebarState } from "./sidebar-state-context";
import { useEffect } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Resumen",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operaciones",
    items: [
      { href: "/casos", label: "Casos", icon: Briefcase },
      { href: "/tareas", label: "Tareas", icon: ListChecks },
      { href: "/calendario", label: "Calendario", icon: Calendar },
      { href: "/documentos", label: "Documentos", icon: FileText },
      { href: "/publicaciones", label: "Publicaciones", icon: Megaphone },
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
    items: [{ href: "/configuracion", label: "Configuración", icon: Settings }],
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
  const mod = useModKey();
  const { mobileOpen, setMobileOpen } = useSidebarState();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Cerrar el drawer móvil cuando cambia la ruta — si el usuario clickea
  // un ítem, la nav se cierra sola.
  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Overlay para móvil cuando el drawer está abierto */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "z-50 flex h-screen shrink-0 flex-col text-sidebar-foreground",
          // Sidebar SIEMPRE navy profundo
          "bg-[#051D33] text-[#E6EEF8]",
          "border-r border-white/[0.06]",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          // Posicionamiento — IMPORTANTE: las dos clases de position van
          // en la misma línea para que el variant md: gane sobre el base.
          // Mobile: fixed slide-in (overlay). Desktop md+: sticky top-0
          // para que se quede pegado al scrollear el contenido.
          // No usar md:relative + md:sticky en líneas separadas — Tailwind
          // emite ambas reglas con la misma especificidad y `relative`
          // gana alfabéticamente → el sidebar termina scrolleando con la
          // página. Solo md:sticky es suficiente: sticky se comporta como
          // relative en flujo normal y ADEMÁS se ancla al top al scrollear.
          "fixed inset-y-0 left-0 md:sticky md:top-0 md:inset-y-auto",
          // Width: drawer ancho fijo en móvil, colapsable en desktop.
          mobileOpen ? "w-[260px]" : collapsed ? "w-[72px]" : "w-[244px]",
          // Visibility en móvil
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
      {/* Brand */}
      <div className="relative flex h-16 items-center justify-between border-b border-white/[0.06] px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.05]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white text-[#051D33]">
            <Scale className="h-4 w-4" />
          </span>
          {!collapsed ? (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="min-w-0 leading-tight"
            >
              <p className="truncate text-[13px] font-semibold tracking-tight text-white">
                {firmName}
              </p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                Legal Suite
              </p>
            </motion.div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-md text-white/55 press transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Asistente IA — discreto */}
      <div className="px-3 pt-3">
        <Link
          href="/casos"
          className={cn(
            "group flex items-center gap-2.5 rounded-md border border-white/[0.10] bg-white/[0.04] px-2.5 py-2 press",
            "transition-colors hover:bg-white/[0.08] hover:border-white/[0.18]",
            collapsed ? "justify-center" : "",
          )}
          title={collapsed ? "Asistente IA" : undefined}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#4D93C7]" />
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <p className="text-[12px] font-medium tracking-tight text-white">
                Asistente IA
              </p>
              <p className="text-[10px] text-white/50">{mod} · J en un caso</p>
            </div>
          ) : null}
        </Link>
      </div>

      {/* Nav grupos */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
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
                        "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                        "transition-[color] duration-150",
                        active
                          ? "text-white font-medium"
                          : "text-white/65 hover:text-white",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      {/* Indicador activo — pill se desliza con layoutId */}
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          aria-hidden
                          className="absolute inset-0 rounded-md bg-white/[0.08]"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      ) : null}
                      {/* Barra activa a la izquierda */}
                      {active ? (
                        <motion.span
                          layoutId="sidebar-active-bar"
                          aria-hidden
                          className="absolute -left-2 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-[#4D93C7]"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      ) : null}
                      <Icon
                        className={cn(
                          "relative h-4 w-4 shrink-0",
                          active ? "text-[#4D93C7]" : "",
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

      {/* User card — click sobre el avatar lleva a /configuracion;
          hover muestra el botón de logout chiquito a la derecha. */}
      <div className="border-t border-white/[0.06] p-3">
        <div
          className={cn(
            "group/user relative flex items-center gap-2.5 rounded-md",
            !collapsed && "transition-colors",
          )}
        >
          <Link
            href="/configuracion"
            title="Mi cuenta · Configuración"
            className={cn(
              "press flex min-w-0 flex-1 items-center gap-2.5 rounded-md",
              !collapsed
                ? "px-1.5 py-1 hover:bg-white/[0.05]"
                : "justify-center",
            )}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.10] text-[11px] font-semibold text-white ring-1 ring-white/[0.10] transition-colors group-hover/user:ring-white/[0.25]">
              {initialsOf(user.name)}
            </span>
            <AnimatePresence>
              {!collapsed ? (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className="min-w-0 leading-tight"
                >
                  <p className="truncate text-[12px] font-medium tracking-tight text-white">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-white/45">
                    {ROLE_LABEL[user.role] ?? user.role}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Link>

          {/* Botón logout — aparece en hover, no colapsado */}
          {!collapsed ? (
            <form action={logoutAction} className="shrink-0">
              <button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="grid h-7 w-7 place-items-center rounded-md text-white/45 opacity-0 transition-all group-hover/user:opacity-100 hover:bg-white/[0.06] hover:text-white press"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </aside>
    </>
  );
}
