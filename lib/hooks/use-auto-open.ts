"use client";

// Lee el query param `?nuevo=1` (lo pone el command palette al elegir
// "Nuevo caso"/"Nuevo cliente") para auto-abrir un drawer de creación, y
// limpia el param de la URL al montar, así cerrar + refrescar no re-abre,
// y volver con el botón "atrás" tampoco.
//
// Uso:
//   const autoOpen = useAutoOpen();
//   const [open, setOpen] = useState(autoOpen);

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useAutoOpen(param = "nuevo", value = "1"): boolean {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Capturamos el valor en el primer render, el efecto de limpieza corre
  // después, pero el initial state del drawer ya tomó este valor.
  const initial = useRef(searchParams.get(param) === value).current;

  useEffect(() => {
    if (!initial) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(param);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return initial;
}
