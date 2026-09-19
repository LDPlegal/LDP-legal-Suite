"use client";

// F7+ Bloque 4, Idle timeout client-side.
//
// La spec pide cerrar sesión a los 30 min de INACTIVIDAD (sin mouse,
// teclado, scroll, ni cambios de pestaña). Implementarlo a nivel de
// session TTL del servidor (lo intenté primero) genera races con
// cookieCache que terminan en ERR_TOO_MANY_REDIRECTS. La forma robusta
// es contarlo en el cliente: si el usuario no produce eventos por
// X minutos, le mostramos warning y luego signOut.
//
// Eventos que cuentan como "actividad": mousemove, keydown, scroll,
// touchstart, visibilitychange (cuando la pestaña vuelve al foco).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signOut } from "@/lib/auth/client";

const IDLE_MS = 30 * 60 * 1000; // 30 min
const WARN_BEFORE_MS = 60 * 1000; // avisar al usuario 1 min antes

export function IdleLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    function clearTimers() {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
    }

    function reset() {
      clearTimers();
      setWarning(false);
      warnRef.current = setTimeout(() => {
        setWarning(true);
        toast.warning("Sesión por expirar", {
          description: "Tu sesión va a cerrarse en 1 min por inactividad. Movete o tecleá algo para mantenerla.",
          duration: WARN_BEFORE_MS,
        });
      }, IDLE_MS - WARN_BEFORE_MS);
      timerRef.current = setTimeout(async () => {
        try {
          await signOut();
        } catch {
          // ignore
        }
        toast.info("Sesión cerrada por inactividad.");
        router.replace("/login");
      }, IDLE_MS);
    }

    const events: Array<keyof DocumentEventMap | keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "visibilitychange",
    ];
    for (const ev of events) {
      window.addEventListener(ev, reset, { passive: true });
    }
    reset();

    return () => {
      clearTimers();
      for (const ev of events) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [router]);

  // Render nothing visible, the toast handles UX.
  void warning;
  return null;
}
