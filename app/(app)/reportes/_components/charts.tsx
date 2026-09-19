// Reportes — tablas, no gráficos decorativos (handoff 3p).
//
// Antes este archivo exportaba un BarChart de antigüedad y un LineChart de
// horas, ambos de recharts. El rediseño pide lectura tabular.
//
// El de antigüedad se retiró por completo: la pestaña "Por cobrar (aging)"
// ya tenía una tabla "Detalle por bucket" con exactamente los mismos datos,
// así que convertirlo habría dejado la misma información dos veces.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function HoursMonthlyChart({
  data,
}: {
  data: Array<{ month: string; total: number; billable: number }>;
}) {
  const totalHoras = data.reduce((a, r) => a + r.total, 0);
  const totalFacturables = data.reduce((a, r) => a + r.billable, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mes</TableHead>
          <TableHead className="w-[96px] text-right">Total</TableHead>
          <TableHead className="w-[110px] text-right">Facturables</TableHead>
          <TableHead className="w-[84px] text-right">% Fact.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r) => {
          const pct = r.total > 0 ? (r.billable / r.total) * 100 : 0;
          return (
            <TableRow key={r.month}>
              <TableCell className="font-medium">{r.month}</TableCell>
              <TableCell className="tabular text-right">
                {r.total.toFixed(1)}h
              </TableCell>
              <TableCell className="tabular text-right">
                {r.billable.toFixed(1)}h
              </TableCell>
              <TableCell className="tabular text-right text-subtle">
                {pct.toFixed(0)}%
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow className="bg-secondary hover:bg-secondary">
          <TableCell className="font-semibold">Total</TableCell>
          <TableCell className="tabular text-right font-semibold">
            {totalHoras.toFixed(1)}h
          </TableCell>
          <TableCell className="tabular text-right font-semibold">
            {totalFacturables.toFixed(1)}h
          </TableCell>
          <TableCell className="tabular text-right text-subtle">
            {totalHoras > 0
              ? `${((totalFacturables / totalHoras) * 100).toFixed(0)}%`
              : "—"}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
