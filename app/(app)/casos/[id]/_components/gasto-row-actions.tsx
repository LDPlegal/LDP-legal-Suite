"use client";

import { useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatInFirmTz } from "@/lib/datetime/format";
import { EXPENSE_STATUS_LABEL } from "@/lib/schemas/fase1";
import { eliminarGastoAction } from "@/app/_actions/gastos/eliminar";
import { GastoFormDrawer, type EditableExpense } from "./gasto-form-drawer";

export function GastoRowActions({
  expense,
  caseId,
  status,
  userName,
}: {
  expense: EditableExpense;
  caseId: string;
  status: "draft" | "approved" | "invoiced";
  userName: string | null;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Gastos ya facturados son inmutables — la factura los congela. Mostramos
  // editar/eliminar deshabilitados o los ocultamos directamente.
  const locked = status === "invoiced";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        className="h-8 w-8"
        label="Ver detalle del gasto"
        onClick={() => setViewOpen(true)}
      >
        <Eye className="h-4 w-4" />
      </IconButton>
      <IconButton
        className="h-8 w-8"
        label={locked ? "Gasto ya facturado — no se puede editar" : "Editar gasto"}
        onClick={() => setEditOpen(true)}
        disabled={locked}
      >
        <Pencil className="h-4 w-4" />
      </IconButton>
      {!locked ? (
        <ConfirmButton
          action={eliminarGastoAction}
          title="¿Eliminar este gasto?"
          description={`"${expense.description}" — esta acción es reversible (queda archivado).`}
          confirmLabel="Eliminar"
          trigger={
            <IconButton
              className="h-8 w-8 text-destructive"
              label="Eliminar gasto (archivar)"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          }
        >
          <input type="hidden" name="expenseId" value={expense.id} />
          <input type="hidden" name="caseId" value={caseId} />
        </ConfirmButton>
      ) : null}

      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalle de gasto</SheetTitle>
            <SheetDescription>Solo lectura. Para modificar, usá «Editar».</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3 text-sm">
            <DetailRow label="Descripción">
              <p className="whitespace-pre-wrap">{expense.description}</p>
            </DetailRow>
            <DetailRow label="Monto">
              <span className="font-mono font-medium">
                {expense.currency} {Number(expense.amount).toFixed(2)}
              </span>
            </DetailRow>
            <DetailRow label="Fecha">
              {formatInFirmTz(expense.incurredOn, undefined, "EEEE dd 'de' MMMM yyyy")}
            </DetailRow>
            <DetailRow label="Facturable">
              <Badge variant={expense.billable ? "outline" : "secondary"}>
                {expense.billable ? "Sí" : "No"}
              </Badge>
            </DetailRow>
            <DetailRow label="Estado">
              <Badge
                variant={
                  status === "approved" ? "success" : status === "invoiced" ? "default" : "warning"
                }
              >
                {EXPENSE_STATUS_LABEL[status]}
              </Badge>
            </DetailRow>
            <DetailRow label="Registró">
              {userName ?? <span className="text-muted-foreground">—</span>}
            </DetailRow>
            {expense.receiptUrl ? (
              <DetailRow label="Recibo">
                <a
                  href={expense.receiptUrl}
                  target="_blank"
                  rel="noopener"
                  className="break-all text-primary hover:underline"
                >
                  {expense.receiptUrl}
                </a>
              </DetailRow>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Cerrar
            </Button>
            {!locked ? (
              <Button
                onClick={() => {
                  setViewOpen(false);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <GastoFormDrawer
        caseId={caseId}
        expense={expense}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 border-b pb-2 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
