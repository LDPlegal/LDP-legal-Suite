"use server";

// F7+ Bloque 5 — Envío de correos desde el chat IA via Microsoft Graph.
// Se invoca cuando el usuario clickea "Enviar" en la tarjeta send_email.
// Persiste un registro en sent_emails con audit completo (prompt original,
// chat message, draft de la IA, y el cuerpo final que se mandó tras
// posible edición humana — por ahora la edición no existe pero el slot
// está reservado).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/db/admin";
import { documents, sentEmails, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import {
  getProfile,
  sendMail,
  type SendMailAttachment,
} from "@/lib/oauth/microsoft-graph";
import { and, eq, inArray } from "drizzle-orm";
import { logAuditStandalone } from "@/lib/audit/log";
import { getStorage } from "@/lib/storage";

const RecipientSchema = z.object({
  email: z.string().email("Email inválido."),
  name: z.string().trim().max(120).optional(),
});

const Schema = z.object({
  caseId: z.string().uuid().optional(),
  chatMessageId: z.string().uuid().optional(),
  to: z.array(RecipientSchema).min(1).max(20),
  cc: z.array(RecipientSchema).max(20).optional(),
  bcc: z.array(RecipientSchema).max(20).optional(),
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string().trim().min(1).max(50_000),
  originalPrompt: z.string().trim().max(8000).optional(),
  attachDocumentIds: z.array(z.string().uuid()).max(10).optional(),
});

export type SendEmailState =
  | { ok: true; sentEmailId: string }
  | { ok: false; error: string };

// Anexa la firma del usuario si está configurada.
function appendSignature(bodyHtml: string, signature: string | null): string {
  if (!signature) return bodyHtml;
  // Si la firma ya está en el body (ej. porque la IA la incluyó), no
  // duplicar. Comparación naive — buscamos las primeras 40 chars de la
  // firma sin tags.
  const sigPlain = signature.replace(/<[^>]+>/g, "").slice(0, 40).trim();
  if (sigPlain && bodyHtml.includes(sigPlain.slice(0, 20))) return bodyHtml;
  return `${bodyHtml}\n<br><br>\n${signature}`;
}

export async function sendEmailFromChatAction(
  input: z.input<typeof Schema>,
): Promise<SendEmailState> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos del correo inválidos." };
  }
  const data = parsed.data;

  // Fetch user signature.
  const [u] = await adminDb
    .select({ emailSignature: users.emailSignature, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);

  const finalBody = appendSignature(data.bodyHtml, u?.emailSignature ?? null);

  // Determinar from. Microsoft Graph usa la cuenta del token (no se puede
  // override). Para audit lo resolvemos desde /me.
  let fromAddress = u?.email ?? "unknown";
  try {
    const profile = await getProfile(user.userId);
    fromAddress = profile.mail ?? profile.userPrincipalName ?? fromAddress;
  } catch {
    // /me falló — probablemente no hay token Microsoft. Falla rápida con
    // mensaje útil.
    return {
      ok: false,
      error: "No tenés Microsoft conectado. Andá a /configuracion → Seguridad y conectá tu cuenta.",
    };
  }

  // Resolver adjuntos: el modelo nos da una lista de documentIds. Validamos
  // que cada uno pertenece a este firm (RLS-equivalent — adminDb bypasa RLS
  // entonces lo verificamos a mano) y opcionalmente al caso. Después leemos
  // los bytes del storage. Si un doc no existe / pertenece a otro firm /
  // está vacío, abortamos antes de mandar el mail — preferimos fallar
  // explícito a mandar el correo sin adjuntos prometidos.
  let attachments: SendMailAttachment[] | undefined;
  if (data.attachDocumentIds && data.attachDocumentIds.length > 0) {
    const docs = await adminDb
      .select({
        id: documents.id,
        firmId: documents.firmId,
        caseId: documents.caseId,
        name: documents.name,
        mimeType: documents.mimeType,
        storageKey: documents.storageKey,
      })
      .from(documents)
      .where(
        and(
          inArray(documents.id, data.attachDocumentIds),
          eq(documents.firmId, user.firmId),
        ),
      );
    // Si pedíamos N docs y recibimos <N, alguno no existe o es de otro firm.
    if (docs.length !== data.attachDocumentIds.length) {
      const found = new Set(docs.map((d) => d.id));
      const missing = data.attachDocumentIds.filter((id) => !found.has(id));
      return {
        ok: false,
        error: `No pude adjuntar ${missing.length} documento(s) — puede ser que ya no existan o no pertenezcan a este expediente.`,
      };
    }
    // Si el correo está vinculado a un caso, los docs deberían pertenecer al
    // mismo caso (o no tener caso). Esto evita filtrar docs de otro caso por
    // accidente vía un AI que confundió IDs.
    if (data.caseId) {
      const wrongCase = docs.filter(
        (d) => d.caseId !== null && d.caseId !== data.caseId,
      );
      if (wrongCase.length > 0) {
        return {
          ok: false,
          error: `${wrongCase.length} documento(s) pertenecen a otro expediente — no los adjunté por seguridad.`,
        };
      }
    }

    const storage = getStorage();
    try {
      attachments = await Promise.all(
        docs.map(async (d) => ({
          name: d.name,
          mimeType: d.mimeType,
          bytes: await storage.get(d.storageKey),
        })),
      );
    } catch (err) {
      return {
        ok: false,
        error: `No pude leer un adjunto del almacenamiento: ${err instanceof Error ? err.message : "error desconocido"}`,
      };
    }
  }

  // Send.
  try {
    await sendMail(user.userId, {
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      bodyHtml: finalBody,
      saveToSentItems: true,
      attachments,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "error desconocido";
    // Persistir el intento fallido también (auditoría).
    const [failed] = await adminDb
      .insert(sentEmails)
      .values({
        firmId: user.firmId,
        userId: user.userId,
        caseId: data.caseId ?? null,
        provider: "microsoft",
        fromAddress,
        toAddresses: data.to.map((r) => r.email),
        ccAddresses: data.cc?.map((r) => r.email) ?? [],
        bccAddresses: data.bcc?.map((r) => r.email) ?? [],
        subject: data.subject,
        bodyHtml: finalBody,
        aiGenerated: true,
        aiOriginalPrompt: data.originalPrompt ?? null,
        aiChatMessageId: data.chatMessageId ?? null,
        aiDraftBody: data.bodyHtml,
        attachmentDocumentIds: data.attachDocumentIds ?? [],
        error: errMsg.slice(0, 500),
      })
      .returning({ id: sentEmails.id });
    void failed;
    return { ok: false, error: `Error al enviar: ${errMsg}` };
  }

  // Persistir éxito.
  const [row] = await adminDb
    .insert(sentEmails)
    .values({
      firmId: user.firmId,
      userId: user.userId,
      caseId: data.caseId ?? null,
      provider: "microsoft",
      fromAddress,
      toAddresses: data.to.map((r) => r.email),
      ccAddresses: data.cc?.map((r) => r.email) ?? [],
      bccAddresses: data.bcc?.map((r) => r.email) ?? [],
      subject: data.subject,
      bodyHtml: finalBody,
      aiGenerated: true,
      aiOriginalPrompt: data.originalPrompt ?? null,
      aiChatMessageId: data.chatMessageId ?? null,
      aiDraftBody: data.bodyHtml,
      attachmentDocumentIds: data.attachDocumentIds ?? [],
    })
    .returning({ id: sentEmails.id });
  if (!row) return { ok: false, error: "No se pudo registrar el envío." };

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "case",
    entityId: data.caseId ?? row.id,
    caseId: data.caseId,
    action: "sent",
    summary: `Correo IA enviado: ${data.subject} → ${data.to.map((r) => r.email).join(", ")}`,
    diff: {
      to: data.to.map((r) => r.email),
      cc: data.cc?.map((r) => r.email),
      subject: data.subject,
      sentEmailId: row.id,
    },
  });

  if (data.caseId) revalidatePath(`/casos/${data.caseId}`);
  return { ok: true, sentEmailId: row.id };
}
