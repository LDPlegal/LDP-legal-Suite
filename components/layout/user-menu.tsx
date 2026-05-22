"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, UserCog } from "lucide-react";
import { logoutAction } from "@/app/_actions/auth/logout";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  partner: "Socio",
  lawyer: "Abogado",
  paralegal: "Paralegal",
  tester: "Tester informático",
  client: "Cliente",
};

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Menú de usuario"
          className="rounded-full"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary ring-1 ring-primary/15">
            {initials || "?"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 p-1"
      >
        {/* Header del menu con avatar + datos */}
        <div className="flex items-center gap-3 px-2 py-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary ring-1 ring-primary/15">
            {initials || "?"}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {email}
            </p>
            <p className="text-[10px] uppercase tracking-[0.10em] text-muted-foreground/70">
              {ROLE_LABEL[role] ?? role}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/configuracion" className="cursor-pointer">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            Configuración
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <form action={logoutAction}>
          <button type="submit" className="w-full">
            <DropdownMenuItem
              asChild
              className="cursor-pointer focus:bg-destructive/10 focus:text-destructive"
            >
              <span className="text-destructive">
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
