"use client";

// Detecta plataforma del usuario para mostrar el modificador de teclado
// correcto en los shortcuts:
//   Mac → ⌘ (Cmd)
//   Windows / Linux → Ctrl
//
// Server-render seguro: el primer render asume "mac" (display ⌘) y
// re-renderiza con el valor real en el cliente. Como sólo cambia el
// label visual, no hay hydration mismatch real, usamos useEffect para
// resolver después del mount.

import { useEffect, useState } from "react";

export type Platform = "mac" | "win" | "other";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "mac";
  // navigator.platform está deprecated pero todavía funciona universal.
  // navigator.userAgent es el fallback.
  const platform = (navigator.platform || "").toLowerCase();
  const ua = (navigator.userAgent || "").toLowerCase();
  if (platform.includes("mac") || ua.includes("mac os")) return "mac";
  if (platform.includes("win") || ua.includes("windows")) return "win";
  return "other";
}

export function usePlatform(): Platform {
  // Default "mac" en server-render, la mayoría del UI tooling se diseña
  // pensando en Mac, y si el usuario es Windows lo corregimos a los ms
  // del mount.
  const [platform, setPlatform] = useState<Platform>("mac");
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);
  return platform;
}

// Conveniencia: devuelve "⌘" en Mac, "Ctrl" en Windows/Linux.
export function useModKey(): "⌘" | "Ctrl" {
  return usePlatform() === "mac" ? "⌘" : "Ctrl";
}
