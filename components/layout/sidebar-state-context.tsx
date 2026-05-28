"use client";

// Estado compartido del sidebar móvil. El header tiene un botón hamburger
// que abre el drawer; el sidebar consume este estado para saber cuándo
// renderizarse como drawer overlay vs. fixed permanente.

import { createContext, useContext, useState, type ReactNode } from "react";

type SidebarStateValue = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleMobile: () => void;
};

const SidebarStateContext = createContext<SidebarStateValue | null>(null);

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <SidebarStateContext.Provider
      value={{
        mobileOpen,
        setMobileOpen,
        toggleMobile: () => setMobileOpen((v) => !v),
      }}
    >
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState(): SidebarStateValue {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) {
    // Fallback no-op si el provider no envuelve — útil para evitar crashes
    // si un componente del header se renderiza fuera del app layout.
    return {
      mobileOpen: false,
      setMobileOpen: () => {},
      toggleMobile: () => {},
    };
  }
  return ctx;
}
