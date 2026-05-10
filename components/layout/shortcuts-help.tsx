"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Keyboard shortcuts cheat sheet, opened with `?` from anywhere in the app
// (when no input is focused). The shortcuts themselves live in the
// individual feature components — this dialog is documentation only.

type Shortcut = { keys: string[]; description: string };

const GROUPS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: "Navegación",
    items: [
      { keys: ["⌘", "K"], description: "Búsqueda global (clientes, casos)" },
      { keys: ["?"], description: "Mostrar esta ayuda" },
      { keys: ["Esc"], description: "Cerrar drawers / diálogos" },
    ],
  },
  {
    title: "Tablas y formularios",
    items: [
      { keys: ["Tab"], description: "Avanzar al siguiente campo" },
      { keys: ["Shift", "Tab"], description: "Retroceder al campo anterior" },
      { keys: ["Enter"], description: "Enviar el formulario activo" },
    ],
  },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only fire when not typing in an input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable ||
        false;
      if (e.key === "?" && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            Atajos de teclado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.title}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{s.description}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
