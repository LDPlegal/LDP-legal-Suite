"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  FileText,
  Receipt,
  Search,
  StickyNote,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const anyResults =
    results.casos.length +
      results.clientes.length +
      results.documentos.length +
      results.facturas.length +
      results.notas.length >
    0;

  return (
    <>
      <Button
        variant="outline"
        className="hidden h-9 w-72 justify-start gap-2 px-3 text-sm text-muted-foreground sm:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        Buscar...
        <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
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
          placeholder="Buscar clientes, casos, documentos, facturas, notas..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!anyResults ? <CommandEmpty>Sin resultados.</CommandEmpty> : null}

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
              <CommandGroup heading="Notas">
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
