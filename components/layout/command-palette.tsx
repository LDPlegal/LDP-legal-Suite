"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Search, Users } from "lucide-react";
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
import { searchPalette } from "@/app/_actions/palette/search";

type PaletteResult = {
  clientes: Array<{ id: string; displayName: string; status: string }>;
  casos: Array<{ id: string; code: string; title: string; status: string }>;
};

const EMPTY: PaletteResult = { clientes: [], casos: [] };

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
    }, 150);
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
        Buscar clientes o casos...
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
          placeholder="Buscar clientes o casos..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {results.casos.length > 0 ? (
            <CommandGroup heading="Casos">
              {results.casos.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`caso-${c.code}-${c.title}`}
                  onSelect={() => go(`/casos/${c.id}`)}
                >
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                  <span className="ml-2">{c.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {results.casos.length > 0 && results.clientes.length > 0 ? (
            <CommandSeparator />
          ) : null}
          {results.clientes.length > 0 ? (
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
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
