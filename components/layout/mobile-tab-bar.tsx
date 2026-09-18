"use client";

// Tab bar inferior de móvil (handoff, sección Móvil).
//
// 74px de alto, cinco destinos: Inicio · Casos · Agenda · Tiempos · Más.
// Activo en #0B2239 con label de 10.5px peso 600; inactivo en #9C9D96.
// "Más" abre el drawer lateral, que ya contiene la navegación completa.
//
// Solo se muestra por debajo de md — en desktop la navegación vive en la
// sidebar.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useSidebarState } from "./sidebar-state-context";

const DESTINOS = [
  { href: "/dashboard", label: "Inicio", icon: "space_dashboard" },
  { href: "/casos", label: "Casos", icon: "work" },
  { href: "/calendario", label: "Agenda", icon: "calendar_month" },
  { href: "/tiempos", label: "Tiempos", icon: "schedule" },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebarState();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // El drawer cubre todo lo que no está en los cuatro destinos fijos.
  const enOtraSeccion = !DESTINOS.some((d) => isActive(d.href));

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex h-[74px] items-stretch border-t border-[#DFE0DC] bg-white md:hidden"
    >
      {DESTINOS.map((d) => {
        const active = isActive(d.href);
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Área táctil mínima de 44px — acá es toda la altura.
              "flex flex-1 flex-col items-center justify-center gap-1 pt-1 transition-colors",
              active ? "text-[#0B2239]" : "text-[#9C9D96]",
            )}
          >
            <Icon name={d.icon} size={23} />
            <span
              className={cn(
                "text-[10.5px]",
                active ? "font-semibold" : "font-medium",
              )}
            >
              {d.label}
            </span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú completo"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 pt-1 transition-colors",
          enOtraSeccion ? "text-[#0B2239]" : "text-[#9C9D96]",
        )}
      >
        <Icon name="menu" size={23} />
        <span
          className={cn(
            "text-[10.5px]",
            enOtraSeccion ? "font-semibold" : "font-medium",
          )}
        >
          Más
        </span>
      </button>
    </nav>
  );
}
