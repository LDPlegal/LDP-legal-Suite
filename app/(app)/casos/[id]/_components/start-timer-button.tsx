"use client";

import { useTransition } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startTimerAction } from "@/app/_actions/timer/start";

export function StartTimerButton({
  caseId,
  caseTitle,
}: {
  caseId: string;
  caseTitle: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        fd.set("caseId", caseId);
        fd.set("description", `Trabajando en: ${caseTitle}`);
        startTransition(async () => {
          try {
            await startTimerAction(fd);
            toast.success("Timer iniciado en este caso");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo iniciar el timer");
          }
        });
      }}
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Play className="h-4 w-4" />
        Iniciar timer
      </Button>
    </form>
  );
}
