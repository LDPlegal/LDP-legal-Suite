"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { requireUser } from "@/lib/auth/session";
import { users } from "@/lib/db/schema";

// Regenerate (or initially create) the iCal feed token. Always issues a fresh
// 32-byte hex string, even if a token already exists — that's the point: any
// previous URL stops working immediately. The admin connection is used so
// RLS doesn't gate this update; the user can only target their own row.
export async function regenerarIcalTokenAction(): Promise<{ token: string }> {
  const user = await requireUser();
  const token = generateOpaqueToken();
  await adminDb
    .update(users)
    .set({ icalToken: token, updatedAt: new Date() })
    .where(eq(users.id, user.userId));
  revalidatePath("/calendario");
  return { token };
}

// Drop the current token, disabling the public feed entirely.
export async function revocarIcalTokenAction(): Promise<void> {
  const user = await requireUser();
  await adminDb
    .update(users)
    .set({ icalToken: null, updatedAt: new Date() })
    .where(eq(users.id, user.userId));
  revalidatePath("/calendario");
}

function generateOpaqueToken(): string {
  // 32 bytes = 64 hex chars. crypto.randomUUID is available in Node 19+,
  // but its 36-char output includes hyphens we don't want in URLs; use the
  // raw byte source via getRandomValues.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
