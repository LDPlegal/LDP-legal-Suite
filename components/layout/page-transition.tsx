// PageTransition, passthrough.
//
// El rediseño visual no admite animaciones de entrada ni movimiento
// decorativo: solo transiciones de color de 120-150ms en hover/estado.
// Se conserva el componente para no tocar los imports del layout; ya no
// envuelve el contenido en ninguna animación.

import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="min-h-full">{children}</div>;
}
