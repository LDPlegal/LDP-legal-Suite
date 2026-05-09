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
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Scale className="h-4 w-4" />
          </span>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{firmName}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                LDP Legal Suite
              </p>
            </div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const cls = cn(
              "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              !item.enabled && "opacity-60",
            );
            return (
              <li key={item.href}>
                <Link href={item.href} className={cls} title={collapsed ? item.label : undefined}>
                  <Icon className="h-4 w-4 shrink-0" />
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

      <div className="border-t border-sidebar-border p-3 text-xs text-muted-foreground">
        {!collapsed ? (
          <div className="space-y-1">
            <p className="font-medium text-foreground">LDP Legal Suite</p>
            <p>Fase 1 · Tiempos · Tareas · Calendario · Gastos</p>
          </div>
        ) : (
          <Clock className="mx-auto h-4 w-4" aria-label="LDP" />
        )}
      </div>
    </aside>
  );
}
