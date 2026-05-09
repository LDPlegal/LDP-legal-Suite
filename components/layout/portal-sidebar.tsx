"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  FileText,
  LayoutDashboard,
  Receipt,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Distinct sidebar for the Portal Cliente. Visually similar to the staff
// sidebar so clients feel they're using the same firm's product, but only
// shows the four sections they have access to: dashboard, casos, facturas,
// documentos. No timer, no firm-switch, no admin links.

const NAV = [
  { href: "/portal/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/portal/casos", label: "Mis casos", icon: Briefcase },
  { href: "/portal/facturas", label: "Facturas", icon: Receipt },
  { href: "/portal/documentos", label: "Documentos", icon: FileText },
];

export function PortalSidebar({
  firmName,
  clientName,
}: {
  firmName: string;
  clientName: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
        <Link href="/portal/dashboard" className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Scale className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{firmName}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Portal cliente
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{clientName}</p>
        <p>Portal LDP Legal Suite</p>
      </div>
    </aside>
  );
}
