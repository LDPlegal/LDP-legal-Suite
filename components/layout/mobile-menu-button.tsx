"use client";

// Botón hamburger del header — solo visible en móvil. Toggle del drawer
// sidebar via SidebarStateContext.

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebarState } from "./sidebar-state-context";

export function MobileMenuButton() {
  const { toggleMobile } = useSidebarState();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={toggleMobile}
      aria-label="Abrir menú"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
