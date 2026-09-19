"use client";

// Reusable conflict-of-interest alert. Mount inside any form that captures a
// party's tax_id (cliente form drawer, caso form drawer). It debounces the
// user's input and calls checkConflictsAction; if the firm already has that
// party as a client or as a counterparty in another case, it renders a
// non-blocking warning banner so the user can take an informed decision —
// the form still submits normally on user confirmation.

import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { checkConflictsAction } from "@/app/_actions/conflictos/check";
import {
  CONFLICT_KIND_LABEL,
  type ConflictHit,
  type ConflictReport,
} from "@/lib/conflictos/types";

type Mode =
  | { kind: "client"; excludeClientId?: string }
  | { kind: "case"; excludeCaseId?: string };

export function ConflictAlert({
  taxId,
  name,
  mode,
}: {
  taxId: string | null | undefined;
  name?: string | null;
  mode: Mode;
}) {
  const [report, setReport] = useState<ConflictReport>({ hits: [], blocking: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = (taxId ?? "").trim();
    const n = (name ?? "").trim();
    // Don't even fire for very short input — avoids noise while typing.
    if (t.length < 5 && n.length < 4) {
      setReport({ hits: [], blocking: false });
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await checkConflictsAction({
          taxId: t || null,
          name: n || null,
          excludeClientId: mode.kind === "client" ? mode.excludeClientId : undefined,
          excludeCaseId: mode.kind === "case" ? mode.excludeCaseId : undefined,
        });
        if (!cancelled) setReport(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [taxId, name, mode]);

  if (report.hits.length === 0) {
    if (loading) {
      return (
        <p className="text-xs text-muted-foreground">Verificando conflictos…</p>
      );
    }
    return null;
  }

  const isStrong = report.blocking;
  return (
    <div
      className={[
        "rounded-md border p-3 text-sm",
        isStrong
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-muted/40 text-foreground",
      ].join(" ")}
      role={isStrong ? "alert" : "status"}
    >
      <div className="flex items-start gap-2">
        {isStrong ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 space-y-2">
          <p className="font-medium">
            {isStrong
              ? "Posible conflicto de interés"
              : "Coincidencias por nombre — revisa antes de continuar"}
          </p>
          <ul className="space-y-1.5">
            {report.hits.map((h) => (
              <ConflictItem key={`${h.refType}:${h.refId}:${h.kind}`} hit={h} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Esto es informativo. Puedes confirmar y continuar; el sistema solo
            registra el match para auditoría.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConflictItem({ hit }: { hit: ConflictHit }) {
  const href =
    hit.refType === "client" ? `/clientes/${hit.refId}` : `/casos/${hit.refId}`;
  return (
    <li className="text-xs">
      <span className="font-medium">{CONFLICT_KIND_LABEL[hit.kind]}: </span>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-primary"
      >
        {hit.label}
        <ExternalLink className="h-3 w-3" />
      </Link>
      <span className="ml-1 text-muted-foreground">· {hit.detail}</span>
      {hit.involvedLawyers && hit.involvedLawyers.length > 0 ? (
        <div className="mt-0.5 ml-4 text-muted-foreground">
          Trabajaron este caso: {hit.involvedLawyers.map((l) => l.name).join(", ")}
        </div>
      ) : null}
    </li>
  );
}
