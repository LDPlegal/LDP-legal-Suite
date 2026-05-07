"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ClienteSchema } from "@/lib/schemas/cliente";
import { createClient } from "@/lib/db/queries/clients";

export type ClienteFormState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

export async function crearClienteAction(
  _prev: ClienteFormState | undefined,
  formData: FormData,
): Promise<ClienteFormState> {
  const user = await requireUser();
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

  const created = await createClient(user.firmId, user.userId, parsed.data);
  revalidatePath("/clientes");
  redirect(`/clientes/${created.id}`);
}
