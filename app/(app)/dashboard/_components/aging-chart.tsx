"use client";

// Bar chart de aging de cuentas por cobrar — muestra los 5 buckets con
// colores escalonados (vigente verde → 90+ rojo) y tooltip al hover.
// Reemplaza la tabla aburrida del dashboard.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AgingBucket = {
  bucket: string;
  label: string;
  total: number;
  count: number;
};

const COLORS: Record<string, { fill: string; stroke: string }> = {
  current: { fill: "#10B981", stroke: "#059669" },
  d1_30: { fill: "#3B82F6", stroke: "#2563EB" },
  d31_60: { fill: "#F59E0B", stroke: "#D97706" },
  d61_90: { fill: "#F97316", stroke: "#EA580C" },
  d90_plus: { fill: "#DC2626", stroke: "#B91C1C" },
};

export function AgingChart({ data }: { data: AgingBucket[] }) {
  const totalSum = data.reduce((a, b) => a + b.total, 0);
  if (totalSum === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        Sin facturas pendientes — todo cobrado al día.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            {Object.entries(COLORS).map(([key, c]) => (
              <linearGradient
                key={key}
                id={`grad-${key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={c.fill} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c.fill} stopOpacity={0.55} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(v) => {
              if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
              return String(v);
            }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              boxShadow: "var(--glass-shadow-lg)",
              fontSize: 12,
            }}
            formatter={((value: number, _name: string, item: { payload: AgingBucket }) => [
              `DOP ${value.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `${item.payload.count} factura${item.payload.count !== 1 ? "s" : ""}`,
            ]) as unknown as (value: number) => [string, string]}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="total" radius={[8, 8, 2, 2]} maxBarSize={56}>
            {data.map((entry) => (
              <Cell key={entry.bucket} fill={`url(#grad-${entry.bucket})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
