"use client";

// Sidebar del rediseño visual — blanca, 238px, borde derecho #DFE0DC.
// Ítem activo en marino sólido; inactivo con icono azul de acción.
// Sin gradientes, sin sombras, sin movimiento: solo transiciones de color.
// Referencia: design_handoff_rediseno_visual/Nav Lateral.dc.html

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/_actions/auth/logout";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useSidebarState } from "./sidebar-state-context";

type NavItem = {
  href: string;
  label: string;
  /** Nombre del símbolo en Material Symbols Sharp. */
  icon: string;
};

type NavGroup = {
  /** null = sin encabezado de grupo (Dashboard va suelto arriba). */
  label: string | null;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: "space_dashboard" }],
  },
  {
    label: "Operaciones",
    items: [
      { href: "/casos", label: "Casos", icon: "work" },
      { href: "/tareas", label: "Tareas", icon: "checklist" },
      { href: "/calendario", label: "Calendario", icon: "calendar_month" },
      { href: "/documentos", label: "Documentos", icon: "description" },
      { href: "/biblioteca", label: "Biblioteca", icon: "menu_book" },
      { href: "/publicaciones", label: "Publicaciones", icon: "campaign" },
    ],
  },
  {
    label: "Gente",
    items: [
      { href: "/clientes", label: "Clientes", icon: "groups" },
      { href: "/conflictos", label: "Conflictos", icon: "gpp_maybe" },
    ],
  },
  {
    label: "Tiempo y dinero",
    items: [
      { href: "/tiempos", label: "Tiempos", icon: "schedule" },
      { href: "/facturacion", label: "Facturación", icon: "receipt_long" },
      { href: "/reportes", label: "Reportes", icon: "bar_chart" },
    ],
  },
];

// Al pie, separado del resto de la navegación.
const FOOTER_ITEM: NavItem = {
  href: "/configuracion",
  label: "Ajustes",
  icon: "settings",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
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

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-[11px] px-[10px] py-[9px] text-[14px] transition-colors duration-150 ease-out",
        collapsed && "justify-center",
        active
          ? "bg-[#0B2239] font-medium text-white"
          : "text-[#3D4038] hover:bg-[#EFF0EC]",
      )}
    >
      <Icon
        name={item.icon}
        size={19}
        className={active ? "text-white" : "text-[#0F4C81]"}
      />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
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
  const { mobileOpen, setMobileOpen } = useSidebarState();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Cerrar el drawer móvil cuando cambia la ruta.
  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[#0B1929]/45 md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "z-50 flex h-screen shrink-0 flex-col border-r border-[#DFE0DC] bg-white",
          "transition-[width,transform] duration-200 ease-out",
          // Mobile: drawer fixed. Desktop: sticky al top.
          "fixed inset-y-0 left-0 md:sticky md:top-0 md:inset-y-auto",
          mobileOpen ? "w-[260px]" : collapsed ? "w-[68px]" : "w-[238px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Monograma + microetiqueta */}
        <div
          className={cn(
            "flex items-start justify-between pt-5",
            collapsed ? "px-3 pb-4" : "px-[18px] pb-[18px]",
          )}
        >
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-col items-start gap-[9px]"
            title={firmName}
          >
            {collapsed ? (
              <Image
                src="/marketing-photos/monogram-navy.png"
                alt={firmName}
                width={40}
                height={23}
                priority
                className="h-auto w-[40px]"
              />
            ) : (
              <>
                <Image
                  src="/marketing-photos/monogram-navy.png"
                  alt={firmName}
                  width={164}
                  height={94}
                  priority
                  className="h-auto w-[164px]"
                />
                <span className="microlabel">Legal Suite</span>
              </>
            )}
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Colapsar menú"
              className="hidden h-7 w-7 place-items-center text-[#9C9D96] transition-colors hover:bg-[#EFF0EC] hover:text-[#3D4038] md:grid"
            >
              <Icon name="left_panel_close" size={18} />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expandir menú"
            className="mx-auto mb-2 hidden h-7 w-7 place-items-center text-[#9C9D96] transition-colors hover:bg-[#EFF0EC] hover:text-[#3D4038] md:grid"
          >
            <Icon name="left_panel_open" size={18} />
          </button>
        ) : null}

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-[10px]">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label ?? `root-${gi}`} className="flex flex-col gap-px">
              {group.label && !collapsed ? (
                <div className="px-[10px] pb-[5px] pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9C9D96]">
                  {group.label}
                </div>
              ) : null}
              {group.label && collapsed ? (
                <div className="mx-[10px] my-2 border-t border-[#E7E8E4]" />
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Ajustes al pie */}
        <div className="px-[10px] pb-3 pt-2">
          <NavLink
            item={FOOTER_ITEM}
            active={isActive(FOOTER_ITEM.href)}
            collapsed={collapsed}
          />
        </div>

        {/* Bloque de usuario */}
        <div
          className={cn(
            "group/user flex items-center gap-[10px] border-t border-[#E7E8E4] pb-4 pt-[14px]",
            collapsed ? "justify-center px-2" : "px-[18px]",
          )}
        >
          <Link
            href="/configuracion"
            title="Mi cuenta · Ajustes"
            className="flex min-w-0 flex-1 items-center gap-[10px]"
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#E4EBF2] text-[11.5px] font-semibold text-[#0F4C81]">
              {initialsOf(user.name)}
            </span>
            {!collapsed ? (
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-medium text-[#0B1929]">
                  {user.name}
                </span>
                <span className="text-[11.5px] text-[#8E8F89]">
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </span>
            ) : null}
          </Link>

          {!collapsed ? (
            <form action={logoutAction} className="shrink-0">
              <button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="grid h-7 w-7 place-items-center text-[#9C9D96] opacity-0 transition-colors hover:bg-[#EFF0EC] hover:text-[#3D4038] focus-visible:opacity-100 group-hover/user:opacity-100"
              >
                <Icon name="logout" size={17} />
              </button>
            </form>
          ) : null}
        </div>
      </aside>
    </>
  );
}
