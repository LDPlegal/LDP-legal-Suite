"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buscarDocumentosAction,
  type BuscarDocsState,
} from "@/app/_actions/ai/buscar-documentos";

// Client component embedded in /documentos. Keeps the existing keyword
// search untouched; this is an opt-in "ask Claude" box. Submit triggers
// the server action and renders ranked results below.
export function AiDocumentSearch() {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<BuscarDocsState | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setPending(true);
    try {
      const r = await buscarDocumentosAction(query);
      setState(r);
      if (!r.ok) toast.error(r.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Búsqueda IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Pregunta en lenguaje natural. Claude rankea los documentos del firm
          por relevancia semántica usando el OCR.
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Ej. ¿Qué documentos mencionan retención del 10%?"
            maxLength={500}
            disabled={pending}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={pending || query.trim().length < 2} className="shrink-0">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Buscar
          </Button>
        </form>

        {state?.ok ? (
          state.results.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {state.candidateCount === 0
                ? "Sin documentos OCR-indexados todavía."
                : "Claude no encontró documentos suficientemente relevantes para esa pregunta."}
            </p>
          ) : (
            <ul className="space-y-2">
              {state.results.map((r) => (
                <li key={r.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/api/documentos/${r.id}/download`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.name}
                      </Link>
                      {r.caseCode ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          <Link
                            href={`/casos/${r.caseId}`}
                            className="font-mono hover:underline"
                          >
                            {r.caseCode}
                          </Link>
                          {r.caseTitle ? ` · ${r.caseTitle}` : ""}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-foreground/80">{r.reason}</p>
                    </div>
                    <span className="shrink-0 rounded-md border bg-muted px-2 py-1 font-mono text-[10px] tabular-nums">
                      {r.score.toFixed(1)} / 10
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {state?.ok ? (
          <p className="text-[10px] text-muted-foreground">
            {state.candidateCount} candidatos · {state.usage.inputTokens} tokens
            entrada · {state.usage.outputTokens} salida
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
