"use server";

// Resolves a generate_document tool_use call from the matter chat. The
// chat panel calls this AFTER the assistant emitted the tool block.
//
// Why two steps (chat → tool resolve) instead of one: the streaming /
// confirmation UX. The chat can show the user "I'm about to generate
// this acta — confirm?" before we actually spend the .docx generation
// + storage write. The user clicks the "Generar" button on the tool card
// in the chat, which calls this action.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled, AiNotConfiguredError } from "@/lib/ai";
import { renderMarkdownToDocx } from "@/lib/ai/docx-generator";
import { resolveSkillsFor } from "@/lib/ai/skills";
import { getStorage } from "@/lib/storage";
import { getCaseById } from "@/lib/db/queries/cases";
import { createDocument } from "@/lib/db/queries/documents";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  caseId: z.string().uuid(),
  chatMessageId: z.string().uuid().optional(),
  documentType: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  bodyMarkdown: z.string().min(1).max(200_000),
  originalPrompt: z.string().min(1).max(8000),
});

export type GenerateDocState =
  | { ok: true; documentId: string; downloadUrl: string }
  | { ok: false; error: string };

export async function generateDocFromChatAction(input: {
  caseId: string;
  chatMessageId?: string;
  documentType: string;
  title: string;
  bodyMarkdown: string;
  originalPrompt: string;
}): Promise<GenerateDocState> {
  const user = await requireUser();
  if (!isAiEnabled()) {
    return { ok: false, error: "La IA no está configurada." };
  }
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }
  const caso = await getCaseById(user.firmId, user.userId, parsed.data.caseId);
  if (!caso) return { ok: false, error: "Caso no encontrado o sin acceso." };

  // Resolve which skills applied (for audit trail) — same set we sent to
  // the LLM when it produced the body.
  let appliedSkillIds: string[] = [];
  try {
    const skills = await resolveSkillsFor({
      matterType: caso.case.matterType,
      documentType: parsed.data.documentType,
    });
    appliedSkillIds = skills.map((s) => s.meta.id);
  } catch {
    // Fall through — skill resolution failure shouldn't block the doc.
  }

  // Render docx.
  let bytes: Uint8Array;
  try {
    bytes = await renderMarkdownToDocx({
      title: parsed.data.title,
      body: parsed.data.bodyMarkdown,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Error de render: ${err.message}` : "No se pudo generar el .docx.",
    };
  }

  // Persist in storage.
  const storage = getStorage();
  const fileName = `${parsed.data.title.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}.docx`;
  const storageKey = storage.buildKey({
    firmId: user.firmId,
    scope: "documents",
    entityId: parsed.data.caseId,
    filename: fileName,
  });
  await storage.put(
    storageKey,
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  // Register row with the AI audit trail filled in.
  const doc = await createDocument(user.firmId, user.userId, {
    caseId: parsed.data.caseId,
    clientId: caso.case.clientId,
    name: parsed.data.title,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: bytes.byteLength,
    storageKey,
    tags: ["ia-generado", `tipo:${parsed.data.documentType}`],
    ocrText: parsed.data.bodyMarkdown, // markdown sirve como búsqueda full-text
    ocrStatus: "done",
    aiGenerated: true,
    aiOriginalPrompt: parsed.data.originalPrompt,
    aiSkillIds: appliedSkillIds,
    aiChatMessageId: parsed.data.chatMessageId ?? null,
    reviewStatus: "pending",
  } as Parameters<typeof createDocument>[2]);

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "document",
    entityId: doc.id,
    caseId: parsed.data.caseId,
    action: "created",
    summary: `Generó documento por IA: ${parsed.data.title}`,
    diff: {
      documentType: parsed.data.documentType,
      reviewStatus: "pending",
      skillIds: appliedSkillIds,
    },
  });

  revalidatePath(`/casos/${parsed.data.caseId}`);
  return {
    ok: true,
    documentId: doc.id,
    downloadUrl: `/api/documentos/${doc.id}/download`,
  };
}

export async function approveAiDocumentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("documentId"));
  const { adminDb } = await import("@/lib/db/admin");
  const { documents } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  await adminDb
    .update(documents)
    .set({
      reviewStatus: "approved",
      reviewedBy: user.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, id), eq(documents.firmId, user.firmId)));
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "document",
    entityId: id,
    action: "approved",
    summary: "Aprobó documento generado por IA",
  });
  revalidatePath("/casos");
}

export async function rejectAiDocumentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("documentId"));
  const { adminDb } = await import("@/lib/db/admin");
  const { documents } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  await adminDb
    .update(documents)
    .set({
      reviewStatus: "rejected",
      reviewedBy: user.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, id), eq(documents.firmId, user.firmId)));
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "document",
    entityId: id,
    action: "deleted",
    summary: "Rechazó documento generado por IA",
  });
  revalidatePath("/casos");
}

void AiNotConfiguredError;
