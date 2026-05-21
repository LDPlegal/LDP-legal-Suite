"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

const Schema = z.string().trim().max(2000);

export async function saveEmailSignatureAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const raw = formData.get("signature");
  const parsed = Schema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) return { ok: false, error: "Firma muy larga." };
  await adminDb
    .update(users)
    .set({ emailSignature: parsed.data || null, updatedAt: new Date() })
    .where(eq(users.id, user.userId));
  revalidatePath("/configuracion");
  return { ok: true };
}
