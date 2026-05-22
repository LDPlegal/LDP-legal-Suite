"use client";

// PageTransition — fade + slide sutil al cambiar de ruta. Hace que la
// navegación entre /casos, /tareas, /clientes, etc. sea fluida en vez
// de cortes secos. AnimatePresence con key=pathname.

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: 0.28,
          ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
        }}
        className="min-h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
