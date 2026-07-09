// Registry de widgets del dashboard personalizable.
//
// Cada usuario guarda en users.preferences.dashboardWidgets un arreglo
// ordenado de { id, visible }. El registry define TODOS los widgets
// disponibles, su etiqueta, descripción, ancho en la grilla y si vienen
// visibles por defecto. La página del dashboard resuelve el layout mezclando
// lo guardado por el usuario con el registry (así, widgets nuevos que se
// agreguen acá aparecen automáticamente para todos).

export type WidgetSpan = "quarter" | "third" | "half" | "two_thirds" | "full";

export type DashboardWidgetDef = {
  id: string;
  label: string;
  description: string;
  span: WidgetSpan;
  defaultVisible: boolean;
};

// Orden por defecto = orden de este arreglo. Para agregar un widget nuevo:
// (1) añadir una entrada acá, (2) renderizarlo en el switch de
// app/(app)/dashboard/_components/dashboard-widgets.tsx.
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    id: "ai_hero",
    label: "Asistente IA",
    description: "Barra de acceso rápido al asistente y sugerencias.",
    span: "full",
    defaultVisible: true,
  },
  {
    id: "kpi_casos",
    label: "KPI · Casos abiertos",
    description: "Cantidad de casos abiertos y total.",
    span: "quarter",
    defaultVisible: true,
  },
  {
    id: "kpi_clientes",
    label: "KPI · Clientes",
    description: "Total de clientes activos y prospectos.",
    span: "quarter",
    defaultVisible: true,
  },
  {
    id: "kpi_horas",
    label: "KPI · Mis horas (mes)",
    description: "Horas registradas y facturables este mes.",
    span: "quarter",
    defaultVisible: true,
  },
  {
    id: "kpi_cobrar",
    label: "KPI · Por cobrar",
    description: "Monto pendiente de cobro (YTD).",
    span: "quarter",
    defaultVisible: true,
  },
  {
    id: "kpi_tareas",
    label: "KPI · Mis tareas pendientes",
    description: "Cantidad de tareas abiertas asignadas a vos.",
    span: "quarter",
    defaultVisible: false,
  },
  {
    id: "aging",
    label: "Cuentas por cobrar (aging)",
    description: "Gráfico de antigüedad de las facturas vigentes.",
    span: "half",
    defaultVisible: true,
  },
  {
    id: "proximos_eventos",
    label: "Próximos 7 días",
    description: "Eventos y audiencias de la próxima semana.",
    span: "half",
    defaultVisible: true,
  },
  {
    id: "sugerencias",
    label: "Sugerencias del asistente",
    description: "Recomendaciones proactivas de la IA.",
    span: "full",
    defaultVisible: true,
  },
  {
    id: "mis_tareas",
    label: "Mis tareas pendientes",
    description: "Lista de tus tareas abiertas con vencimientos.",
    span: "half",
    defaultVisible: true,
  },
  {
    id: "actividad",
    label: "Actividad reciente",
    description: "Últimos movimientos del equipo en la firma.",
    span: "half",
    defaultVisible: true,
  },
  {
    id: "casos_recientes",
    label: "Casos recientes",
    description: "Los últimos casos abiertos, con acceso rápido.",
    span: "half",
    defaultVisible: false,
  },
  {
    id: "agenda_hoy",
    label: "Agenda de hoy",
    description: "Solo los eventos y audiencias de hoy.",
    span: "half",
    defaultVisible: false,
  },
  {
    id: "facturas_vencidas",
    label: "Facturas vencidas",
    description: "Facturas con saldo pendiente y fecha de pago vencida.",
    span: "half",
    defaultVisible: false,
  },
  {
    id: "tareas_equipo",
    label: "Tareas del equipo",
    description: "Tareas pendientes de toda la firma (no solo las tuyas).",
    span: "half",
    defaultVisible: false,
  },
];

const WIDGET_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
const DEF_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export type ResolvedWidget = DashboardWidgetDef & { visible: boolean };

/**
 * Mezcla la config guardada del usuario con el registry:
 *  - respeta el orden y la visibilidad guardados,
 *  - descarta ids desconocidos (widgets removidos),
 *  - agrega al final los widgets del registry que el usuario aún no tiene
 *    (widgets nuevos), con su visibilidad por defecto.
 */
export function resolveDashboardLayout(
  saved: Array<{ id: string; visible: boolean }> | undefined | null,
): ResolvedWidget[] {
  const result: ResolvedWidget[] = [];
  const seen = new Set<string>();

  if (Array.isArray(saved)) {
    for (const entry of saved) {
      if (!entry || typeof entry.id !== "string") continue;
      const def = DEF_BY_ID.get(entry.id);
      if (!def || seen.has(entry.id)) continue;
      result.push({ ...def, visible: entry.visible !== false });
      seen.add(entry.id);
    }
  }

  for (const def of DASHBOARD_WIDGETS) {
    if (seen.has(def.id)) continue;
    result.push({ ...def, visible: def.defaultVisible });
  }

  return result;
}

/** Clase Tailwind de ancho en la grilla de 12 columnas (lg+). */
export const SPAN_CLASS: Record<WidgetSpan, string> = {
  quarter: "lg:col-span-3",
  third: "lg:col-span-4",
  half: "lg:col-span-6",
  two_thirds: "lg:col-span-8",
  full: "lg:col-span-12",
};

/** Valida/normaliza un layout que viene del cliente antes de guardarlo. */
export function normalizeDashboardLayout(
  input: unknown,
): Array<{ id: string; visible: boolean }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ id: string; visible: boolean }> = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== "string" || !WIDGET_IDS.has(id) || seen.has(id)) continue;
    const visible = (raw as { visible?: unknown }).visible !== false;
    out.push({ id, visible });
    seen.add(id);
  }
  return out;
}
