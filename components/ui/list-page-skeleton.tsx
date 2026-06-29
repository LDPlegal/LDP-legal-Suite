import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

// Skeleton generico para paginas de listado (casos, clientes, documentos).
// Se usa desde los loading.tsx — Next lo muestra al instante durante la
// navegacion mientras el server resuelve las queries del listado.
export function ListPageSkeleton({
  rows = 8,
  withFilters = true,
}: {
  rows?: number;
  withFilters?: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {withFilters ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {/* Header de tabla */}
        <div className="flex gap-4 border-b p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Filas */}
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
