"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { getCurrentFirm, updateFirm } from "@/lib/db/queries/firms";
import { logAuditStandalone } from "@/lib/audit/log";

// Max base64 length for the logo. ~100KB encoded. Big enough for a clean
// SVG/PNG, small enough that the firms row stays sensible.
const MAX_LOGO_BASE64 = 140_000;

const LogoSchema = z.object({
  logoBase64: z
    .string()
    .max(MAX_LOGO_BASE64, "Logo demasiado grande (máx ~100KB)")
    .refine(
      (v) => v.startsWith("data:image/"),
      "Solo se aceptan imágenes (PNG, JPG, SVG, WebP).",
    ),
});

export type LogoState =
  | { ok: true }
  | { ok: false; error: string };

export async function subirLogoFirmAction(
  _prev: LogoState | undefined,
  formData: FormData,
): Promise<LogoState> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return { ok: false, error: "Solo admin y socios pueden cambiar el logo." };
  }
  const parsed = LogoSchema.safeParse({
    logoBase64: formData.get("logoBase64") ?? "",
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Logo inválido." };
  }

  await updateFirm(user.firmId, user.userId, {
    logoUrl: parsed.data.logoBase64,
  });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: user.firmId,
    action: "updated",
    summary: "Actualizó el logo del firm",
  });
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function quitarLogoFirmAction(): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) return;
  await updateFirm(user.firmId, user.userId, { logoUrl: null });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: user.firmId,
    action: "updated",
    summary: "Quitó el logo del firm",
  });
  revalidatePath("/configuracion");
}

const BrandingSchema = z.object({
  invoiceHeader: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  invoiceFooter: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export type BrandingState =
  | { ok: true }
  | { ok: false; error: string };

export async function actualizarBrandingFacturaAction(
  _prev: BrandingState | undefined,
  formData: FormData,
): Promise<BrandingState> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return { ok: false, error: "Solo admin y socios pueden editar branding." };
  }
  const parsed = BrandingSchema.safeParse({
    invoiceHeader: formData.get("invoiceHeader"),
    invoiceFooter: formData.get("invoiceFooter"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  const firm = await getCurrentFirm(user.firmId, user.userId);
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const nextSettings: Record<string, unknown> = {
    ...settings,
    invoiceHeader: parsed.data.invoiceHeader ?? null,
    invoiceFooter: parsed.data.invoiceFooter ?? null,
  };
  await updateFirm(user.firmId, user.userId, { settings: nextSettings });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: user.firmId,
    action: "updated",
    summary: "Actualizó branding de factura",
  });
  revalidatePath("/configuracion");
  return { ok: true };
}
