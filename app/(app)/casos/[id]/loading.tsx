import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

// Skeleton de carga para el detalle de caso. Next lo muestra al instante
// durante la navegacion mientras el server resuelve las queries del caso,
// asi el usuario ve la estructura de inmediato en vez de una pantalla en
// blanco. Imita el layout real (header + tabs + contenido).
export default function LoadingCaso() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-28" />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>

      {/* Contenido del tab activo */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5 lg:col-span-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </Card>
      </div>
    </div>
  );
}
