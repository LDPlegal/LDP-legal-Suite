import { z } from "zod";

export const CaseFeeTypeEnum = z.enum([
  "flat_fee",
  "retainer",
  "success_fee",
  "other",
]);
export type CaseFeeType = z.infer<typeof CaseFeeTypeEnum>;

export const CASE_FEE_TYPE_LABEL: Record<CaseFeeType, string> = {
  flat_fee: "Tarifa plana",
  retainer: "Iguala / Retainer",
  success_fee: "Honorario de éxito",
  other: "Otro",
};

/** Validador de monto decimal en string (formato "1000" o "1000.50"). */
const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/u, "Monto inválido");

/** Honorario individual del caso. Modelo dual-currency:
 *  - amountUsd: monto en dólares (opcional)
 *  - amountDop: monto en pesos (opcional)
 *  - Al menos uno debe estar presente (validado en superRefine). */
export const CaseFeeInputSchema = z
  .object({
    feeType: CaseFeeTypeEnum,
    description: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    amountUsd: moneyString.optional().or(z.literal("").transform(() => undefined)),
    amountDop: moneyString.optional().or(z.literal("").transform(() => undefined)),
  })
  .superRefine((val, ctx) => {
    if (!val.amountUsd && !val.amountDop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountUsd"],
        message: "Cargá al menos un monto (USD o DOP).",
      });
    }
  });
export type CaseFeeInput = z.infer<typeof CaseFeeInputSchema>;

export const MatterTypeEnum = z.enum([
  "civil",
  "corporate",
  "real_estate",
  "criminal",
  "labor",
  "tax",
  "administrative",
  "other",
]);
export type MatterType = z.infer<typeof MatterTypeEnum>;

export const MATTER_LABEL: Record<MatterType, string> = {
  civil: "Civil",
  corporate: "Corporativo",
  real_estate: "Inmobiliario",
  criminal: "Penal",
  labor: "Laboral",
  tax: "Fiscal",
  administrative: "Administrativo",
  other: "Otro",
};

export const CASE_STATUS_LABEL: Record<"open" | "on_hold" | "closed", string> = {
  open: "Abierto",
  on_hold: "En espera",
  closed: "Cerrado",
};

export const BILLING_MODE_LABEL: Record<
  "hourly" | "flat_fee" | "retainer" | "contingency",
  string
> = {
  hourly: "Por hora",
  flat_fee: "Tarifa plana",
  retainer: "Iguala (retainer)",
  contingency: "Contingencia",
};

export const CasoSchema = z
  .object({
    title: z.string().trim().min(3, "Título muy corto").max(240),
    clientId: z.string().uuid("Cliente inválido"),
    matterType: MatterTypeEnum,
    description: z.string().trim().max(4000).optional().or(z.literal("").transform(() => undefined)),
    status: z.enum(["open", "on_hold", "closed"]).default("open"),
    leadLawyerId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    billingMode: z.enum(["hourly", "flat_fee", "retainer", "contingency"]).default("hourly"),
    // Honorarios multi-moneda. Cada uno: tipo + descripción opcional + monto + moneda.
    // Vacío permitido — un caso por hora puede no tener fees fijos cargados.
    fees: z.array(CaseFeeInputSchema).default([]),
    court: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
    counterpartyName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    counterpartyTaxId: z
      .string()
      .trim()
      .max(40)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    tags: z.array(z.string().trim().min(1).max(40)).default([]),
    visibility: z.enum(["firm", "restricted"]).default("firm"),
    assignments: z
      .array(
        z.object({
          userId: z.string().uuid(),
          roleInCase: z.enum(["lead", "associate", "paralegal"]),
        }),
      )
      .default([]),
  })
  .superRefine((val, ctx) => {
    if (val.visibility === "restricted") {
      const hasLead = val.assignments.some((a) => a.roleInCase === "lead");
      if (!hasLead) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assignments"],
          message: "Un caso restringido requiere al menos un abogado líder asignado",
        });
      }
    }
    // En modo flat_fee, exigimos al menos un honorario de tipo flat_fee
    // cargado. En modo retainer, al menos un retainer. Esto evita casos
    // marcados como "tarifa plana" sin honorarios definidos — confunde al
    // momento de facturar.
    if (val.billingMode === "flat_fee") {
      const hasFlat = val.fees.some((f) => f.feeType === "flat_fee");
      if (!hasFlat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fees"],
          message:
            "Modo 'Tarifa plana' requiere al menos un honorario de tipo 'Tarifa plana' cargado.",
        });
      }
    }
    if (val.billingMode === "retainer") {
      const hasRetainer = val.fees.some((f) => f.feeType === "retainer");
      if (!hasRetainer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fees"],
          message:
            "Modo 'Iguala' requiere al menos un honorario de tipo 'Iguala / Retainer' cargado.",
        });
      }
    }
  });

export type CasoInput = z.infer<typeof CasoSchema>;
