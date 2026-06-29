import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function LoadingDashboard() {
  return (
    <div className="space-y-7">
      {/* Saludo */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-24" />
          </Card>
        ))}
      </div>

      {/* Aging + próximos eventos */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-[200px] w-full" />
        </Card>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
