import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  module,
  phase,
  description,
}: {
  module: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold">{module}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Próximamente · {phase}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
