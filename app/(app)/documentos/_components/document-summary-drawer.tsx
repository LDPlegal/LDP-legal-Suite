"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
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
  resumirDocumentoAction,
  type ResumirDocumentoState,
} from "@/app/_actions/ai/resumir-documento";

export function DocumentSummaryDrawer({
  trigger,
  documentId,
  documentName,
}: {
  trigger: ReactNode;
  documentId: string;
  documentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ResumirDocumentoState | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    setState(null);
    try {
      const fd = new FormData();
      fd.set("documentId", documentId);
      const r = await resumirDocumentoAction(undefined, fd);
      setState(r);
      if (!r.ok) toast.error(r.error);
    } finally {
      setPending(false);
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
            Resumen IA del documento
          </SheetTitle>
          <SheetDescription>
            Claude analiza el texto extraído (OCR) de{" "}
            <strong className="text-foreground">{documentName}</strong> y genera
            un resumen ejecutivo con los puntos clave.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {pending ? (
            <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Analizando documento…
            </div>
          ) : state?.ok ? (
            <>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm dark:prose-invert">
                {state.text}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tokens: {state.usage.inputTokens} entrada ·{" "}
                {state.usage.outputTokens} salida. El resumen se genera a partir
                del texto OCR del documento.
              </p>
            </>
          ) : state && !state.ok ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {state.error}
            </div>
          ) : null}
        </SheetBody>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={generate}
            disabled={pending}
          >
            <Sparkles className="h-4 w-4" />
            {state ? "Regenerar" : "Generar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
