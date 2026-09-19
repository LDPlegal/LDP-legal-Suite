"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setCaseAssignments, updateCase } from "@/lib/db/queries/cases";

// Edición de datos básicos del caso + líder + acceso por usuario.
//
// Acceso por usuario (§ 9.2): con visibility='restricted' el caso SOLO lo ven
// los usuarios en case_assignments (+ admins), y eso lo hace cumplir la RLS
// (policy cases_firm_visibility). Los checkboxes de `assignedUserIds` son la
// lista de quién tiene acceso, usuario por usuario. El líder (leadLawyerId)
// siempre se incluye en el acceso para que no pierda su propio caso.
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
  billingMode: z.enum(["hourly", "flat_fee", "retainer", "contingency"]),
  // Líder del caso. "" → sin asignar (null).
  leadLawyerId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
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
    billingMode: formData.get("billingMode") || "hourly",
    leadLawyerId: formData.get("leadLawyerId"),
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

  const leadLawyerId = data.leadLawyerId ?? null;

  // Usuarios con acceso (checkboxes). getAll para el array de uuids marcados.
  const assignedUserIds = new Set(
    formData
      .getAll("assignedUserIds")
      .map((v) => String(v))
      .filter((v) => /^[0-9a-f-]{36}$/i.test(v)),
  );
  // El líder siempre tiene acceso a su propio caso, evitá que un restricted
  // deje al líder afuera por accidente.
  if (leadLawyerId) assignedUserIds.add(leadLawyerId);

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
    billingMode: data.billingMode,
    leadLawyerId,
  });
  if (!updated) return { ok: false, error: "Caso no encontrado." };

  // Reemplazá el set de asignaciones. Rol: 'lead' para el líder, 'associate'
  // para el resto, la RLS solo mira pertenencia, así que el rol es de display.
  await setCaseAssignments(
    user.firmId,
    user.userId,
    data.caseId,
    [...assignedUserIds].map((uid) => ({
      userId: uid,
      roleInCase: uid === leadLawyerId ? ("lead" as const) : ("associate" as const),
    })),
  );

  revalidatePath("/casos");
  revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
