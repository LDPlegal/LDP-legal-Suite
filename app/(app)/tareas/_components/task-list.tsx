"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInFirmTz } from "@/lib/datetime/format";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/schemas/fase1";
import type { TareaRow } from "./tasks-view";

const STATUS_VARIANT: Record<TareaRow["status"], "warning" | "success" | "secondary" | "default"> = {
  todo: "secondary",
  in_progress: "default",
  waiting: "warning",
  done: "success",
};

const PRIORITY_VARIANT: Record<TareaRow["priority"], "default" | "warning" | "destructive" | "secondary"> = {
  low: "secondary",
  med: "default",
  high: "warning",
  urgent: "destructive",
};

export function TaskList({ tareas }: { tareas: TareaRow[] }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead className="w-32">Caso</TableHead>
            <TableHead className="w-36">Asignado</TableHead>
            <TableHead className="w-28">Prioridad</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            <TableHead className="w-32">Vence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tareas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                Sin tareas. Crea una nueva.
              </TableCell>
            </TableRow>
          ) : (
            tareas.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.title}</p>
                  {t.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {t.caseCode ? (
                    <Link href={`/casos/${t.caseId}`} className="hover:underline">
                      {t.caseCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm">{t.assigneeName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[t.priority]}>
                    {TASK_PRIORITY_LABEL[t.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.dueAt ? formatInFirmTz(t.dueAt, undefined, "dd/MM/yyyy") : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
