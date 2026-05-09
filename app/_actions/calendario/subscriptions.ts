"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  createSubscription,
  softDeleteSubscription,
  syncSubscription,
} from "@/lib/db/queries/subscriptions";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z
    .string()
    .trim()
    .url("URL inválida")
    .max(800)
    .refine(
      (u) => /^https?:\/\//u.test(u),
      "Solo se aceptan URLs http(s)",
    ),
});

export type CreateSubscriptionState =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function crearSuscripcionAction(
  _prev: CreateSubscriptionState | undefined,
  formData: FormData,
): Promise<CreateSubscriptionState> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  const sub = await createSubscription(user.firmId, user.userId, parsed.data);
  revalidatePath("/calendario");
  return { ok: true, id: sub.id };
}

export async function eliminarSuscripcionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("subscriptionId"));
  await softDeleteSubscription(user.firmId, user.userId, id);
  revalidatePath("/calendario");
}

// Pull events from the external URL on demand. Returns a small status so the
// UI can show "synced 12 events" or "could not download". Wrapped in a
// non-throwing facade because users will routinely point at URLs that
// timeout, return HTML, or contain partially malformed ICS.
export type SyncSubscriptionState =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function sincronizarSuscripcionAction(
  _prev: SyncSubscriptionState | undefined,
  formData: FormData,
): Promise<SyncSubscriptionState> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("subscriptionId"));
  const result = await syncSubscription(user.firmId, user.userId, id);
  revalidatePath("/calendario");
  return result;
}
