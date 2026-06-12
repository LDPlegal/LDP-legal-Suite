// Server component — pagination simple para el listado global de docs.
// Renderiza: "X-Y de Z resultados · ← Anterior · Página N · Siguiente →"
// Los hrefs preservan otros searchParams (q, shared) para que la búsqueda
// no se pierda al paginar.

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationStrip({
  page,
  pageSize,
  total,
  shown,
  searchParams,
  basePath = "/documentos",
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  searchParams: Record<string, string | undefined>;
  basePath?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function hrefForPage(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v) params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = (page - 1) * pageSize + shown;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? (
          "Sin resultados"
        ) : (
          <>
            {firstShown}–{lastShown} de {total}{" "}
            {total === 1 ? "resultado" : "resultados"}
          </>
        )}
      </span>

      <nav className="flex items-center gap-1">
        {hasPrev ? (
          <Link
            href={hrefForPage(page - 1)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </Link>
        ) : (
          <span className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-input bg-muted px-2 opacity-50">
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </span>
        )}

        <span className="px-2 tabular-nums">
          Página {page} de {totalPages}
        </span>

        {hasNext ? (
          <Link
            href={hrefForPage(page + 1)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 hover:bg-accent"
            aria-label="Página siguiente"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-input bg-muted px-2 opacity-50">
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </nav>
    </div>
  );
}
