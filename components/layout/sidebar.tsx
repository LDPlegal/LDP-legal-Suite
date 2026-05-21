"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { href: "/casos", label: "Casos", icon: Briefcase, enabled: true },
  { href: "/clientes", label: "Clientes", icon: Users, enabled: true },
  { href: "/tiempos", label: "Tiempos", icon: Clock, enabled: true },
  { href: "/tareas", label: "Tareas", icon: ListChecks, enabled: true },
  { href: "/calendario", label: "Calendario", icon: Calendar, enabled: true },
  { href: "/documentos", label: "Documentos", icon: FileText, enabled: true },
  { href: "/facturacion", label: "Facturación", icon: Receipt, enabled: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3, enabled: true },
  { href: "/conflictos", label: "Conflictos", icon: ShieldAlert, enabled: true },
  { href: "/configuracion", label: "Configuración", icon: Settings, enabled: true },
];

export function Sidebar({ firmName }: { firmName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        // glass sidebar — backdrop blur sobre el ambient gradient del body.
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col text-sidebar-foreground",
        "bg-[var(--sidebar)] backdrop-blur-2xl",
        "border-r border-sidebar-border",
        "shadow-[1px_0_0_rgba(255,255,255,0.06)_inset]",
        "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo / firm header */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-sidebar-accent/40"
        >
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground",
              "bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))]",
              "shadow-[0_2px_8px_rgba(15,76,129,0.30),inset_0_1px_0_rgba(255,255,255,0.25)]",
            )}
          >
            <Scale className="h-4.5 w-4.5" />
          </span>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold tracking-tight">{firmName}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">
                Legal Suite
              </p>
            </div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md text-muted-foreground press",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
          )}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                    "transition-[background,color,transform] duration-200",
                    active
                      ? cn(
                          // Estado activo: glass tint con borde sutil, no fill sólido.
                          "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                          "shadow-[inset_0_0_0_1px_rgba(15,76,129,0.10)]",
                          "dark:shadow-[inset_0_0_0_1px_rgba(77,147,199,0.20)]",
                        )
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    !item.enabled && "opacity-60",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {/* Active indicator: barra vertical a la izquierda */}
                  {active ? (
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full",
                        "bg-[linear-gradient(180deg,var(--color-brand-500),var(--color-brand-700))]",
                      )}
                      aria-hidden
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      active ? "text-primary" : "group-hover:scale-105",
                    )}
                  />
                  {!collapsed ? (
                    <span className="flex-1 truncate">{item.label}</span>
                  ) : null}
                  {!collapsed && !item.enabled ? (
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Pronto
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-3 text-xs">
        {!collapsed ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="font-medium text-foreground">LDP Legal Suite</span>
            <span className="ml-auto text-[10px] tracking-wider opacity-70">v1</span>
          </div>
        ) : (
          <div
            className="mx-auto h-1.5 w-1.5 rounded-full bg-success animate-pulse"
            aria-label="Estado activo"
          />
        )}
      </div>
    </aside>
  );
}
