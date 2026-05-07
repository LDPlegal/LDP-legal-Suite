"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteClient } from "@/lib/db/queries/clients";

const Schema = z.object({ clientId: z.string().uuid() });

export async function eliminarClienteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({ clientId: formData.get("clientId") });
  await softDeleteClient(user.firmId, user.userId, parsed.clientId);
  revalidatePath("/clientes");
  redirect("/clientes");
}
