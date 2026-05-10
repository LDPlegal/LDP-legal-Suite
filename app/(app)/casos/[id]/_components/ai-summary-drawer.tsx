"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  resumirCasoAction,
  guardarResumenComoNotaAction,
  type ResumirCasoState,
} from "@/app/_actions/ai/resumir-caso";

export function AiSummaryDrawer({
  trigger,
  caseId,
}: {
  trigger: ReactNode;
  caseId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ResumirCasoState | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function generate() {
    setPending(true);
    setState(null);
    try {
      const fd = new FormData();
      fd.set("caseId", caseId);
      const r = await resumirCasoAction(undefined, fd);
      setState(r);
      if (!r.ok) toast.error(r.error);
    } finally {
      setPending(false);
    }
  }

  async function saveAsNote() {
    if (!state || !state.ok) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("caseId", caseId);
      fd.set("text", state.text);
      const r = await guardarResumenComoNotaAction(fd);
      if (r.ok) {
        toast.success("Guardado como nota del caso");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Auto-generate the first time the drawer opens.
        if (v && !state && !pending) generate();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumen IA del caso
          </SheetTitle>
          <SheetDescription>
            Claude lee todo lo registrado en el caso (eventos, notas, gastos,
            tiempos, OCR de documentos) y genera un resumen ejecutivo. Puedes
            guardarlo como nota o regenerarlo si agregaste información nueva.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {pending ? (
            <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Generando resumen…
            </div>
          ) : state?.ok ? (
            <>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm dark:prose-invert">
                {state.text}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tokens: {state.usage.inputTokens} entrada · {state.usage.outputTokens} salida.
                El contenido está basado en el contexto del caso al momento de generar; vuelve
                a generar si actualizas información.
              </p>
            </>
          ) : state && !state.ok ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {state.error}
            </div>
          ) : null}
        </SheetBody>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={generate}
            disabled={pending || saving}
          >
            <Sparkles className="h-4 w-4" />
            {state ? "Regenerar" : "Generar"}
          </Button>
          <Button
            type="button"
            onClick={saveAsNote}
            disabled={!state?.ok || pending || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar como nota
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
