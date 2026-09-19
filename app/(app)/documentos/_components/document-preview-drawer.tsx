"use client";

// Previsualizador in-app de documentos, abre un Sheet lateral con el
// archivo renderizado según el tipo:
//   - PDF: iframe nativo del browser (zoom, scroll, paginación)
//   - Imagen: <img> ajustable al contenedor
//   - Word (.doc/.docx) y texto plano: muestra el texto OCR extraído
//   - Otros: mensaje "preview no disponible, descargar para ver"
//
// El texto OCR se carga on-demand vía server action (no viene en el
// listado para no inflar la respuesta inicial).

import { useEffect, useState, type ReactNode } from "react";
import { Download, ExternalLink, FileText, Loader2, Sparkles, Undo2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
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
import { getDocumentTextAction } from "@/app/_actions/documentos/get-text";
import { formatearDocumentoAction } from "@/app/_actions/ai/formatear-documento";

const TEXT_PREVIEW_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-cfb",
  "text/plain",
  "text/csv",
]);

export function DocumentPreviewDrawer({
  documentId,
  documentName,
  mimeType,
  trigger,
  aiEnabled = false,
  open: controlledOpen,
  onOpenChange,
}: {
  documentId: string;
  documentName: string;
  mimeType: string;
  /** Opcional: sin trigger, el drawer se controla externamente (kebab). */
  trigger?: ReactNode;
  /** Habilita el botón "Mejorar formato con IA" para docs de texto. */
  aiEnabled?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (!isControlled) setInternalOpen(v);
  };
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Formato IA: markdown estructurado del texto plano. Se muestra por
  // defecto (auto) cuando existe; con toggle para ver el texto original.
  const [formatted, setFormatted] = useState<string | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  // Si el formateo automático falla (ej. IA caída), NO reintentamos solos ni
  // molestamos con toasts, mostramos el texto plano. El botón manual sí
  // muestra el error para que el usuario sepa qué pasó.
  const [autoFailed, setAutoFailed] = useState(false);

  // silent=true para el auto-formato al abrir: falla en silencio (solo baja
  // la bandera), sin toast. El botón manual usa silent=false.
  async function doFormat(silent = false) {
    setFormatting(true);
    try {
      const r = await formatearDocumentoAction(documentId);
      if (r.ok) {
        setFormatted(r.markdown);
      } else {
        if (silent) setAutoFailed(true);
        else toast.error("No se pudo dar formato", { description: r.error });
      }
    } finally {
      setFormatting(false);
    }
  }

  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");
  const isTextBased = TEXT_PREVIEW_MIMES.has(mimeType);

  // Cargar el OCR text solo cuando hace falta (texto/Word) y solo una vez.
  // Si la IA está activa y el texto está listo, mostramos el formato: usa
  // el caché si ya existe, o lo genera automáticamente la primera vez.
  useEffect(() => {
    if (!open) return;
    if (!isTextBased) return;
    if (ocrText !== null || ocrStatus !== null) return; // ya cargado
    setLoading(true);
    setError(null);
    getDocumentTextAction(documentId)
      .then((r) => {
        if (r.ok) {
          setOcrText(r.text);
          setOcrStatus(r.ocrStatus);
          if (r.formattedMarkdown) {
            // Caché disponible → mostrar formato al instante, sin costo IA.
            setFormatted(r.formattedMarkdown);
          } else if (
            aiEnabled &&
            r.ocrStatus === "done" &&
            r.text &&
            r.text.trim().length > 0
          ) {
            // Primera vez: generar el formato automáticamente en background,
            // en silencio (si falla, mostramos el texto plano sin molestar).
            void doFormat(true);
          }
        } else {
          setError(r.error);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al cargar texto.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isTextBased, documentId, ocrText, ocrStatus, aiEnabled]);

  const downloadUrl = `/api/documentos/${documentId}/download`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="sm:max-w-5xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="truncate" title={documentName}>
            {documentName}
          </SheetTitle>
          <SheetDescription>
            {isPdf
              ? "Vista previa nativa del PDF, usá los controles del visor para zoom y navegación."
              : isImage
                ? "Vista previa de la imagen."
                : isTextBased
                  ? "Texto extraído del documento (OCR)."
                  : "Este tipo de archivo no se puede previsualizar, descargalo para verlo."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 overflow-hidden p-0">
          <div className="h-full w-full">
            {isPdf ? (
              <iframe
                src={downloadUrl}
                className="h-full w-full border-0"
                title={`Previsualización de ${documentName}`}
              />
            ) : isImage ? (
              <div className="h-full overflow-auto bg-muted/30 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={downloadUrl}
                  alt={documentName}
                  className="mx-auto max-h-full max-w-full object-contain"
                />
              </div>
            ) : isTextBased ? (
              <div className="h-full overflow-y-auto px-6 py-4">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando texto extraído…
                  </div>
                ) : error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : ocrStatus !== "done" ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Texto aún no disponible</p>
                    <p className="text-sm text-muted-foreground">
                      Este documento tiene estado de OCR: <strong>{ocrStatus}</strong>.
                      Si está pendiente o falló, click en el botón ↻ Re-procesar OCR
                      para volver a intentar.
                    </p>
                  </div>
                ) : ocrText ? (
                  <div className="space-y-3">
                    {/* Barra de estado del formato IA */}
                    {aiEnabled ? (
                      formatting ? (
                        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          Dando formato con IA… (títulos y negritas, sin cambiar
                          el contenido)
                        </div>
                      ) : formatted ? (
                        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                          <p className="text-xs text-muted-foreground">
                            <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                            {showOriginal
                              ? "Mostrando el texto original extraído."
                              : "Formato mejorado por IA. El contenido no se modificó."}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowOriginal((v) => !v)}
                            className="shrink-0"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            {showOriginal ? "Ver con formato" : "Ver original"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                          <p className="text-xs text-muted-foreground">
                            {autoFailed
                              ? "La IA no está disponible en este momento, mostrando el texto original."
                              : "El texto se ve plano. La IA puede darle formato legible sin cambiar el contenido."}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => doFormat(false)}
                            className="shrink-0"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            {autoFailed ? "Reintentar" : "Mejorar formato con IA"}
                          </Button>
                        </div>
                      )
                    ) : null}
                    {formatted && !showOriginal ? (
                      <article className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{formatted}</ReactMarkdown>
                      </article>
                    ) : (
                      <article className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                        {ocrText}
                      </article>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    El documento se procesó pero no se extrajo texto.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Este tipo de archivo ({mimeType || "desconocido"}) no se puede
                  previsualizar en el navegador. Descargalo para abrirlo con la
                  aplicación correspondiente.
                </p>
              </div>
            )}
          </div>
        </SheetBody>

        <SheetFooter className="flex-row">
          <Button asChild variant="outline">
            <a href={downloadUrl} target="_blank" rel="noopener">
              <ExternalLink className="h-4 w-4" />
              Abrir en pestaña nueva
            </a>
          </Button>
          <Button asChild>
            <a href={downloadUrl} download={documentName}>
              <Download className="h-4 w-4" />
              Descargar
            </a>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
