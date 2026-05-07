import { z } from "zod";

const TaxIdType = z.enum(["rnc", "cedula", "passport", "other"]);

export const ClienteSchema = z
  .object({
    type: z.enum(["individual", "corporate"]),
    displayName: z.string().trim().min(2, "Nombre muy corto").max(160),
    legalName: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
    taxIdType: TaxIdType.optional(),
    taxId: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)),
    primaryContactName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    email: z
      .string()
      .trim()
      .email("Email inválido")
      .toLowerCase()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    phone: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)),
    address: z.string().trim().max(400).optional().or(z.literal("").transform(() => undefined)),
    billingAddress: z
      .string()
      .trim()
      .max(400)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    status: z.enum(["active", "prospect", "closed"]).default("active"),
  })
  .superRefine((val, ctx) => {
    if (val.type === "corporate" && !val.legalName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legalName"],
        message: "Razón social requerida para clientes jurídicos",
      });
    }
    if (val.taxIdType === "rnc" && val.taxId && !/^\d{3}-?\d{5}-?\d$/u.test(val.taxId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxId"],
        message: "RNC inválido (formato XXX-XXXXX-X)",
      });
    }
    if (val.taxIdType === "cedula" && val.taxId && !/^\d{3}-?\d{7}-?\d$/u.test(val.taxId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxId"],
        message: "Cédula inválida (formato XXX-XXXXXXX-X)",
      });
    }
  });

export type ClienteInput = z.infer<typeof ClienteSchema>;
