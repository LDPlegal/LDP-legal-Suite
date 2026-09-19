import { z } from "zod";

export const SignUpSchema = z.object({
  firmName: z.string().trim().min(2, "Nombre del firm muy corto").max(120),
  rnc: z
    .string()
    .trim()
    .regex(/^\d{3}-?\d{5}-?\d$/u, "RNC inválido")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .or(z.null().transform(() => undefined)),
  name: z.string().trim().min(2, "Nombre muy corto").max(120),
  email: z.string().trim().email("Email inválido").toLowerCase(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72),
});
export type SignUpInput = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: z.string().trim().email("Email inválido").toLowerCase(),
  password: z.string().min(1, "Ingresa tu contraseña"),
});
export type SignInInput = z.infer<typeof SignInSchema>;
