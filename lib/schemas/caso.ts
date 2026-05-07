import { z } from "zod";

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
    flatFeeAmount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/u, "Monto inválido")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    retainerBalance: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/u, "Monto inválido")
      .optional()
      .or(z.literal("").transform(() => undefined)),
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
    if (val.billingMode === "flat_fee" && !val.flatFeeAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["flatFeeAmount"],
        message: "Tarifa plana requerida en modo flat_fee",
      });
    }
  });

export type CasoInput = z.infer<typeof CasoSchema>;
