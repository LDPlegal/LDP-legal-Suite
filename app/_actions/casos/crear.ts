"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { CasoSchema } from "@/lib/schemas/caso";
import { createCase } from "@/lib/db/queries/cases";

export type CasoFormState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function crearCasoAction(
  _prev: CasoFormState | undefined,
  formData: FormData,
): Promise<CasoFormState> {
  const user = await requireUser();

  // Tags: comma-separated string, parse into array.
  const tagsRaw = (formData.get("tags") as string | null)?.trim() ?? "";
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // Assignments: JSON-encoded array (the drawer client component sends it that way).
  let assignments: { userId: string; roleInCase: "lead" | "associate" | "paralegal" }[] = [];
  const rawAssignments = formData.get("assignments");
  if (typeof rawAssignments === "string" && rawAssignments) {
    try {
      const j = JSON.parse(rawAssignments) as unknown;
      if (Array.isArray(j)) {
        assignments = j as typeof assignments;
      }
    } catch {
      // ignore — schema validation will catch malformed assignments
    }
  }

  const parsed = CasoSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId"),
    matterType: formData.get("matterType"),
    description: formData.get("description"),
    status: formData.get("status") || "open",
    leadLawyerId: formData.get("leadLawyerId") || undefined,
    billingMode: formData.get("billingMode") || "hourly",
    flatFeeAmount: formData.get("flatFeeAmount"),
    retainerBalance: formData.get("retainerBalance"),
    court: formData.get("court"),
    counterpartyName: formData.get("counterpartyName"),
    counterpartyTaxId: formData.get("counterpartyTaxId"),
    tags,
    visibility: formData.get("visibility") || "firm",
    assignments,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los datos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;
  const created = await createCase(user.firmId, user.userId, {
    title: data.title,
    clientId: data.clientId,
    matterType: data.matterType,
    description: data.description ?? null,
    status: data.status,
    leadLawyerId: data.leadLawyerId ?? null,
    billingMode: data.billingMode,
    flatFeeAmount: data.flatFeeAmount ?? null,
    retainerBalance: data.retainerBalance ?? null,
    court: data.court ?? null,
    counterpartyName: data.counterpartyName ?? null,
    counterpartyTaxId: data.counterpartyTaxId ?? null,
    tags: data.tags,
    visibility: data.visibility,
    assignments: data.assignments,
  });
  revalidatePath("/casos");
  redirect(`/casos/${created.id}`);
}
