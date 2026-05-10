import { z } from "zod";
import { isValidCedula, isValidRnc } from "@/lib/validation/dgii";

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
    if (val.taxIdType === "rnc" && val.taxId) {
      if (!/^\d{3}-?\d{5}-?\d$/u.test(val.taxId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["taxId"],
          message: "RNC inválido (formato XXX-XXXXX-X)",
        });
      } else if (!isValidRnc(val.taxId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["taxId"],
          message: "RNC inválido: el dígito verificador no coincide.",
        });
      }
    }
    if (val.taxIdType === "cedula" && val.taxId) {
      if (!/^\d{3}-?\d{7}-?\d$/u.test(val.taxId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["taxId"],
          message: "Cédula inválida (formato XXX-XXXXXXX-X)",
        });
      } else if (!isValidCedula(val.taxId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["taxId"],
          message: "Cédula inválida: el dígito verificador no coincide.",
        });
      }
    }
  });

export type ClienteInput = z.infer<typeof ClienteSchema>;
