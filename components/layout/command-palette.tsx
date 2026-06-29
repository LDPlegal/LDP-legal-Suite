"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldAlert,
  StickyNote,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KbdShortcut } from "@/components/ui/kbd";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { searchPalette, type PaletteResult } from "@/app/_actions/palette/search";

const EMPTY: PaletteResult = {
  clientes: [],
  casos: [],
  documentos: [],
  facturas: [],
  notas: [],
};

// Navegación rápida: saltar a cualquier sección sin tocar el mouse. Estas
// son rutas estáticas (no necesitan server), filtradas en cliente por el
// query. cmdk hace el fuzzy-match contra el `value`.
const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof Briefcase }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/casos", label: "Casos", icon: Briefcase },
  { href: "/tareas", label: "Tareas", icon: ListChecks },
  { href: "/calendario", label: "Calendario", icon: Calendar },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/publicaciones", label: "Publicaciones", icon: Megaphone },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/conflictos", label: "Conflictos", icon: ShieldAlert },
  { href: "/tiempos", label: "Tiempos", icon: Clock },
  { href: "/facturacion", label: "Facturación", icon: Receipt },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

// Acciones de creación rápida — navegan a la sección con ?nuevo=1, que el
// drawer de creación lee (useAutoOpen) para abrirse automáticamente. Cmd+K
// → "nuevo caso" → Enter abre el formulario sin tocar el mouse.
const CREATE_ACTIONS: Array<{ href: string; label: string }> = [
  { href: "/casos?nuevo=1", label: "Nuevo caso" },
  { href: "/clientes?nuevo=1", label: "Nuevo cliente" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult>(EMPTY);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchPalette(query);
      if (!cancelled) setResults(r);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <Button
        variant="outline"
        className="hidden h-9 w-72 justify-start gap-2 px-3 text-sm text-muted-foreground sm:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        Buscar...
        <span className="ml-auto">
          <KbdShortcut keys={["mod", "K"]} />
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
      >
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar clientes, casos, documentos, facturas, gestiones..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>

          {/* Navegación rápida — cmdk filtra por el label. Con query vacío
              se muestran todas; escribiendo "fact" matchea Facturación. */}
          <CommandGroup heading="Ir a">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`ir ${item.label}`}
                  onSelect={() => go(item.href)}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/50" />
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Crear">
            {CREATE_ACTIONS.map((action) => (
              <CommandItem
                key={action.href}
                value={`crear ${action.label}`}
                onSelect={() => go(action.href)}
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span>{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {results.casos.length > 0 ? (
            <CommandSeparator />
          ) : null}
          {results.casos.length > 0 ? (
            <CommandGroup heading="Casos">
              {results.casos.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`caso-${c.code}-${c.title}`}
                  onSelect={() => go(`/casos/${c.id}`)}
                >
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.code}
                  </span>
                  <span className="ml-2">{c.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {results.clientes.length > 0 ? (
            <>
              {results.casos.length > 0 ? <CommandSeparator /> : null}
              <CommandGroup heading="Clientes">
                {results.clientes.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`cliente-${c.displayName}`}
                    onSelect={() => go(`/clientes/${c.id}`)}
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{c.displayName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {results.facturas.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Facturas">
                {results.facturas.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`factura-${f.number}-${f.ncf ?? ""}`}
                    onSelect={() => go(`/facturacion/${f.id}`)}
                  >
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{f.number}</span>
                    {f.ncf ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {f.ncf}
                      </span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {f.status}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {results.documentos.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Documentos">
                {results.documentos.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`doc-${d.name}`}
                    onSelect={() =>
                      // Open the download endpoint in a new tab — the palette
                      // doesn't have an inline preview view yet.
                      window.open(`/api/documentos/${d.id}/download`, "_blank")
                    }
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{d.name}</span>
                    {d.caseCode ? (
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {d.caseCode}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {results.notas.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Gestiones">
                {results.notas.map((n) => (
                  <CommandItem
                    key={n.id}
                    value={`nota-${n.title ?? n.id}`}
                    onSelect={() => go(`/casos/${n.caseId}?tab=notas`)}
                  >
                    <StickyNote className="h-4 w-4 text-muted-foreground" />
                    <span>{n.title ?? "(sin título)"}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {n.caseCode}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
