"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { CasoSchema } from "@/lib/schemas/caso";
import { createCase } from "@/lib/db/queries/cases";
import { applyTemplateToCase } from "@/lib/db/queries/matter-templates";

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

  // Honorarios: JSON-encoded array. El client manda { feeType, description,
  // amount, currency }[]. Zod los valida después.
  let fees: unknown[] = [];
  const rawFees = formData.get("fees");
  if (typeof rawFees === "string" && rawFees) {
    try {
      const j = JSON.parse(rawFees) as unknown;
      if (Array.isArray(j)) fees = j;
    } catch {
      // ignore — schema validation catches malformed fees
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
    fees,
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
    court: data.court ?? null,
    counterpartyName: data.counterpartyName ?? null,
    counterpartyTaxId: data.counterpartyTaxId ?? null,
    tags: data.tags,
    visibility: data.visibility,
    assignments: data.assignments,
    fees: data.fees,
  });
  // Optionally apply a matter template — fire after createCase succeeded so
  // we don't leave dangling tasks if the case insert failed. Errors here
  // don't roll back the case; the partner can re-apply manually if needed.
  const rawTemplate = formData.get("templateId");
  const templateParse = z.string().uuid().safeParse(rawTemplate);
  if (templateParse.success) {
    try {
      await applyTemplateToCase(
        user.firmId,
        user.userId,
        templateParse.data,
        created.id,
      );
    } catch {
      // Swallow — the case exists; the user can still manage tasks/events
      // by hand. We don't want template failures to block case creation.
    }
  }

  revalidatePath("/casos");
  redirect(`/casos/${created.id}`);
}
