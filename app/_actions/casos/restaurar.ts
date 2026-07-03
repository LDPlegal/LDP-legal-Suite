"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { restoreCase } from "@/lib/db/queries/cases";
import { logAuditStandalone } from "@/lib/audit/log";

export async function restaurarCasoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    throw new Error("Solo admin y socios pueden restaurar casos.");
  }
  const id = z.string().uuid().parse(formData.get("caseId"));
  const result = await restoreCase(user.firmId, user.userId, id);
  if (result === "parent_archived") {
    // No se puede restaurar un expediente vinculado mientras su padre siga archivado.
    redirect("/casos/archivados?error=parent_archived");
  }
  if (result === "restored") {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "case",
      entityId: id,
      action: "updated",
      summary: "Restauró caso archivado",
    });
  }
  revalidatePath("/casos");
  revalidatePath(`/casos/${id}`);
  revalidatePath("/casos/archivados");
}
