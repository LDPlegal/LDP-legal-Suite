"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { ClienteSchema } from "@/lib/schemas/cliente";
import { updateClient } from "@/lib/db/queries/clients";

const IdSchema = z.object({ clientId: z.string().uuid() });

export type ClienteEditState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function editarClienteAction(
  _prev: ClienteEditState | undefined,
  formData: FormData,
): Promise<ClienteEditState> {
  const user = await requireUser();
  const id = IdSchema.safeParse({ clientId: formData.get("clientId") });
  if (!id.success) {
    return { ok: false, error: "ID de cliente inválido." };
  }

  const parsed = ClienteSchema.safeParse({
    type: formData.get("type"),
    displayName: formData.get("displayName"),
    legalName: formData.get("legalName"),
    taxIdType: formData.get("taxIdType") || undefined,
    taxId: formData.get("taxId"),
    primaryContactName: formData.get("primaryContactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    billingAddress: formData.get("billingAddress"),
    status: formData.get("status") || "active",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los datos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const updated = await updateClient(user.firmId, user.userId, id.data.clientId, parsed.data);
  if (!updated) return { ok: false, error: "Cliente no encontrado." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id.data.clientId}`);
  return { ok: true };
}
