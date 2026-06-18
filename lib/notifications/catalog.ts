// Catálogo central de tipos de notificación.
//
// Cada `kind` que aparece acá:
//   - Se muestra en Configuración → Notificaciones como un toggle de email.
//   - Cuando notify() crea una notificación in-app de ese kind, si el usuario
//     activó el email para ese kind (tabla user_email_prefs), también recibe
//     un correo.
//
// Los kinds que NO están acá igual generan notificación in-app, pero no
// ofrecen toggle de email (no son "emailables").
//
// Sin "use server" / "server-only": este módulo es data pura y lo importan
// tanto el server (notify) como el client (UI de configuración).

export type NotificationKind = {
  kind: string;
  label: string;
  description: string;
  // Para agrupar en la UI.
  group: "Casos y tareas" | "Plazos y agenda" | "Facturación";
};

// Solo los kinds que disparan email a través de notify(). Cada toggle de la
// UI hace algo real. (Las audiencias/plazos se notifican por el sistema de
// alertas del calendario, que es independiente de esta tabla de preferencias.)
export const EMAILABLE_KINDS: NotificationKind[] = [
  {
    kind: "task_assigned",
    label: "Tareas asignadas a mí",
    description: "Cuando alguien te asigna una tarea o te la reasigna.",
    group: "Casos y tareas",
  },
  {
    kind: "case_assigned",
    label: "Casos donde me asignan",
    description: "Cuando te agregan como abogado asignado a un caso.",
    group: "Casos y tareas",
  },
  {
    kind: "invoice_sent",
    label: "Facturas enviadas a clientes",
    description: "Cuando se marca una factura como enviada al cliente.",
    group: "Facturación",
  },
  {
    kind: "invoice_paid",
    label: "Pagos registrados",
    description: "Cuando se registra un pago (total o parcial) en una factura.",
    group: "Facturación",
  },
];

const BY_KIND = new Map(EMAILABLE_KINDS.map((k) => [k.kind, k]));

export function isEmailableKind(kind: string): boolean {
  return BY_KIND.has(kind);
}

export function getKindMeta(kind: string): NotificationKind | undefined {
  return BY_KIND.get(kind);
}
