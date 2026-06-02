"use server";

// Variante de crearClienteAction que NO redirige — devuelve el cliente creado
// para que el caller (típicamente el formulario de caso) lo agregue al
// dropdown y lo seleccione sin perder el contexto.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { ClienteSchema } from "@/lib/schemas/cliente";
import { createClient } from "@/lib/db/queries/clients";

export type CrearClienteInlineState =
  | { ok: true; client: { id: string; displayName: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function crearClienteInlineAction(input: {
  type: "individual" | "corporate";
  displayName: string;
  legalName?: string;
  taxIdType?: "rnc" | "cedula" | "passport" | "other";
  taxId?: string;
  primaryContactName?: string;
  email?: string;
  phone?: string;
}): Promise<CrearClienteInlineState> {
  const user = await requireUser();
  const parsed = ClienteSchema.safeParse({
    type: input.type,
    displayName: input.displayName,
    legalName: input.legalName,
    taxIdType: input.taxIdType,
    taxId: input.taxId,
    primaryContactName: input.primaryContactName,
    email: input.email,
    phone: input.phone,
    address: undefined,
    billingAddress: undefined,
    status: "active",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los datos del cliente.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const created = await createClient(user.firmId, user.userId, parsed.data);
    revalidatePath("/clientes");
    return {
      ok: true,
      client: { id: created.id, displayName: created.displayName },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo crear el cliente.",
    };
  }
}
