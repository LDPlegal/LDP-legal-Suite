"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateCase } from "@/lib/db/queries/cases";

// Edición de datos básicos del caso (no toca assignments ni fees — esos
// tienen su propio flujo y son delicados por billing).
const Schema = z.object({
  caseId: z.string().uuid(),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["open", "on_hold", "closed"]),
  matterType: z.enum([
    "civil",
    "corporate",
    "real_estate",
    "criminal",
    "labor",
    "tax",
    "administrative",
    "other",
  ]),
  court: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  counterpartyName: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  counterpartyTaxId: z.string().trim().max(50).optional().or(z.literal("").transform(() => undefined)),
  tags: z.string().optional(),
  visibility: z.enum(["firm", "restricted"]).default("firm"),
});

export type EditarCasoState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function editarCasoAction(
  _prev: EditarCasoState | undefined,
  formData: FormData,
): Promise<EditarCasoState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    caseId: formData.get("caseId"),
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status") || "open",
    matterType: formData.get("matterType"),
    court: formData.get("court"),
    counterpartyName: formData.get("counterpartyName"),
    counterpartyTaxId: formData.get("counterpartyTaxId"),
    tags: formData.get("tags") ?? "",
    visibility: formData.get("visibility") || "firm",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los datos del caso.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const tags = data.tags
    ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const updated = await updateCase(user.firmId, user.userId, data.caseId, {
    title: data.title,
    description: data.description ?? null,
    status: data.status,
    matterType: data.matterType,
    court: data.court ?? null,
    counterpartyName: data.counterpartyName ?? null,
    counterpartyTaxId: data.counterpartyTaxId ?? null,
    tags,
    visibility: data.visibility,
  });
  if (!updated) return { ok: false, error: "Caso no encontrado." };

  revalidatePath("/casos");
  revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
