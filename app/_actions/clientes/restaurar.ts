"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { restoreClient } from "@/lib/db/queries/clients";
import { logAuditStandalone } from "@/lib/audit/log";

export async function restaurarClienteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    throw new Error("Solo admin y socios pueden restaurar clientes.");
  }
  const id = z.string().uuid().parse(formData.get("clientId"));
  const ok = await restoreClient(user.firmId, user.userId, id);
  if (ok) {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "client",
      entityId: id,
      action: "updated",
      summary: "Restauró cliente archivado",
    });
  }
  revalidatePath("/clientes");
}
