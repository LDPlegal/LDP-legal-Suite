"use client";

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
        <Button variant="ghost" size="icon" aria-label="Menú de usuario">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials || "?"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="font-medium">{name}</p>
          <p className="text-xs font-normal text-muted-foreground">{email}</p>
          <p className="text-xs font-normal text-muted-foreground">
            {ROLE_LABEL[role] ?? role}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracion">
            <UserCog className="h-4 w-4" />
            Configuración
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <button type="submit" className="w-full">
            <DropdownMenuItem asChild>
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
