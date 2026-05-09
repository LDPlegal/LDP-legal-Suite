"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function AgingChart({
  data,
}: {
  data: Array<{ bucket: string; label: string; total: number; count: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number) =>
            new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(v)
          }
        />
        <Bar dataKey="total" fill="#0F4C81" name="Pendiente" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HoursMonthlyChart({
  data,
}: {
  data: Array<{ month: string; total: number; billable: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => `${v.toFixed(1)}h`} />
        <Legend />
        <Line type="monotone" dataKey="total" stroke="#1E6FBA" name="Total" strokeWidth={2} />
        <Line type="monotone" dataKey="billable" stroke="#14B8A6" name="Facturables" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
