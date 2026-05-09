"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { checkConflicts } from "@/lib/db/queries/conflicts";
import type { ConflictReport } from "@/lib/conflictos/types";

const Schema = z.object({
  taxId: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().max(200).optional().nullable(),
  excludeClientId: z.string().uuid().optional(),
  excludeCaseId: z.string().uuid().optional(),
});

// Server action invoked from the client/case form drawers as the user types
// the tax_id (debounced). Returns the conflict report so the form can render
// a non-blocking warning banner with the matched parties.
export async function checkConflictsAction(input: {
  taxId?: string | null;
  name?: string | null;
  excludeClientId?: string;
  excludeCaseId?: string;
}): Promise<ConflictReport> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { hits: [], blocking: false };
  return checkConflicts(user.firmId, user.userId, {
    taxId: parsed.data.taxId ?? null,
    name: parsed.data.name ?? null,
    excludeClientId: parsed.data.excludeClientId,
    excludeCaseId: parsed.data.excludeCaseId,
  });
}
