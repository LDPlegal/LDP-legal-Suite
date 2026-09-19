// Lista simple, antes aplicaba una entrada escalonada con framer-motion.
//
// El handoff no admite animaciones de entrada ni movimiento decorativo,
// así que el stagger se retira. Se conserva el componente y su API para
// no tocar los widgets del dashboard que lo consumen.

import { Children, type ReactNode } from "react";

export function StaggerList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const arr = Children.toArray(children);
  return (
    <ul className={className}>
      {arr.map((child, i) => (
        <li key={i}>{child}</li>
      ))}
    </ul>
  );
}
