// Zod schemas for Fase 1 entities.
// Combined into one file because they're small and share helpers.

import { z } from "zod";

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const decimalString = (label = "Monto inválido") =>
  z.string().trim().regex(/^\d+(\.\d{1,2})?$/u, label);

// ----- Timer ---------------------------------------------------------------

export const StartTimerSchema = z.object({
  caseId: z.string().uuid("Caso inválido"),
  description: optionalString(500),
});
export type StartTimerInput = z.infer<typeof StartTimerSchema>;

// ----- Manual time entry ---------------------------------------------------

export const ManualTimeEntrySchema = z
  .object({
    caseId: z.string().uuid("Caso inválido"),
    description: optionalString(500),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    billable: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    const s = new Date(val.startedAt);
    const e = new Date(val.endedAt);
    if (e <= s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endedAt"],
        message: "La hora de fin debe ser posterior a la de inicio",
      });
    }
  });
export type ManualTimeEntryInput = z.infer<typeof ManualTimeEntrySchema>;

// ----- Task ----------------------------------------------------------------

export const TareaSchema = z.object({
  title: z.string().trim().min(2, "Título muy corto").max(200),
  description: optionalString(2000),
  caseId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  assigneeId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dueAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  priority: z.enum(["low", "med", "high", "urgent"]).default("med"),
  status: z.enum(["todo", "in_progress", "waiting", "done"]).default("todo"),
});
export type TareaInput = z.infer<typeof TareaSchema>;

export const TASK_STATUS_LABEL = {
  todo: "Por hacer",
  in_progress: "En curso",
  waiting: "Esperando",
  done: "Hecho",
} as const;

export const TASK_PRIORITY_LABEL = {
  low: "Baja",
  med: "Media",
  high: "Alta",
  urgent: "Urgente",
} as const;

// ----- Event ---------------------------------------------------------------

export const EventoSchema = z
  .object({
    title: z.string().trim().min(2, "Título muy corto").max(200),
    description: optionalString(2000),
    location: optionalString(200),
    caseId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    allDay: z.boolean().default(false),
    attendees: z.array(z.string().uuid()).default([]),
    reminderMinutes: z.coerce.number().int().min(0).max(10080).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    const s = new Date(val.startAt);
    const e = new Date(val.endAt);
    if (e <= s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "El fin debe ser posterior al inicio",
      });
    }
  });
export type EventoInput = z.infer<typeof EventoSchema>;

// ----- Expense -------------------------------------------------------------

export const GastoSchema = z.object({
  caseId: z.string().uuid("Caso inválido"),
  description: z.string().trim().min(2, "Descripción muy corta").max(400),
  amount: decimalString(),
  currency: z.string().trim().min(3).max(3).default("DOP"),
  incurredOn: z.string().datetime({ offset: true }),
  billable: z.boolean().default(true),
  receiptUrl: optionalString(500),
});
export type GastoInput = z.infer<typeof GastoSchema>;

export const EXPENSE_STATUS_LABEL = {
  draft: "Pendiente",
  approved: "Aprobado",
  invoiced: "Facturado",
} as const;

export const TIME_ENTRY_STATUS_LABEL = {
  draft: "Pendiente",
  approved: "Aprobado",
  invoiced: "Facturado",
} as const;
