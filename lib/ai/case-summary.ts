// Case summary prompt builder + caller (Fase 5.2).
//
// We collect the case + everything attached to it (events, notes, time,
// expenses, document OCR snippets) and ask Claude for an executive summary.
// The point: a senior partner walking into a case for the first time gets
// a useful one-pager instead of clicking through six tabs.
//
// Token discipline: we cap each section so a busy case doesn't blow the
// context window. Per section limits aim at ~30k tokens of input total
// (well within Sonnet's 200k window with a comfortable margin).

import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { withFirm } from "@/lib/db/with-firm";
import {
  cases,
  clients,
  documents,
  events,
  expenses,
  notes,
  timeEntries,
  users,
} from "@/lib/db/schema";
import { runPrompt } from "./claude";
import { tiptapToPlainText } from "./tiptap-text";

const MAX_NOTES = 20;
const MAX_NOTE_CHARS = 1500;
const MAX_EVENTS = 30;
const MAX_DOCS = 30;
const MAX_DOC_OCR_CHARS = 1200;
const MAX_TIME_ENTRIES = 50;
const MAX_EXPENSES = 30;

export type CaseSummaryResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  context: {
    eventCount: number;
    noteCount: number;
    timeEntryCount: number;
    expenseCount: number;
    docCount: number;
  };
};

export async function summarizeCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<CaseSummaryResult> {
  const ctx = await gatherCaseContext(firmId, userId, caseId);
  if (!ctx) throw new Error("Caso no encontrado.");

  const promptText = buildPrompt(ctx);
  const result = await runPrompt(
    [{ role: "user", content: promptText }],
    {
      systemAddendum:
        "El usuario te pasa el contexto completo de un caso. Devuelve un resumen ejecutivo en español, en formato Markdown, con las siguientes secciones cuando aplique: **Hechos y partes**, **Estado actual**, **Próximos pasos / pendientes**, **Riesgos o señales de alerta**, **Métricas** (horas registradas, gastos, facturado). Sé conciso — máximo 400 palabras. Solo usa información del contexto; si una sección no tiene datos, di 'Sin información disponible' en vez de inventar.",
      maxTokens: 1500,
      temperature: 0.3,
    },
  );

  return {
    text: result.text,
    usage: result.usage,
    context: {
      eventCount: ctx.events.length,
      noteCount: ctx.notes.length,
      timeEntryCount: ctx.timeEntries.length,
      expenseCount: ctx.expenses.length,
      docCount: ctx.documents.length,
    },
  };
}

type CaseContext = {
  case: {
    code: string;
    title: string;
    matterType: string;
    status: string;
    description: string | null;
    court: string | null;
    counterpartyName: string | null;
    leadLawyerName: string | null;
    openedAt: Date;
    closedAt: Date | null;
  };
  client: { displayName: string; legalName: string | null };
  events: Array<{ title: string; description: string | null; location: string | null; startAt: Date }>;
  notes: Array<{ title: string | null; text: string; createdAt: Date; authorName: string | null }>;
  timeEntries: Array<{ description: string | null; durationSeconds: number; billable: boolean; startedAt: Date }>;
  expenses: Array<{ description: string; amount: string; currency: string; incurredOn: Date }>;
  documents: Array<{ name: string; ocrSnippet: string | null; createdAt: Date }>;
  totals: {
    totalSeconds: number;
    billableSeconds: number;
    totalExpenses: number;
  };
};

async function gatherCaseContext(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<CaseContext | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [head] = await tx
      .select({
        code: cases.code,
        title: cases.title,
        matterType: cases.matterType,
        status: cases.status,
        description: cases.description,
        court: cases.court,
        counterpartyName: cases.counterpartyName,
        openedAt: cases.openedAt,
        closedAt: cases.closedAt,
        leadLawyerName: users.name,
        clientName: clients.displayName,
        clientLegalName: clients.legalName,
      })
      .from(cases)
      .innerJoin(clients, eq(clients.id, cases.clientId))
      .leftJoin(users, eq(users.id, cases.leadLawyerId))
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
      .limit(1);
    if (!head) return null;

    const [eventRows, noteRows, timeRows, expenseRows, docRows] = await Promise.all([
      tx
        .select({
          title: events.title,
          description: events.description,
          location: events.location,
          startAt: events.startAt,
        })
        .from(events)
        .where(and(eq(events.caseId, caseId), isNull(events.deletedAt)))
        .orderBy(asc(events.startAt))
        .limit(MAX_EVENTS),
      tx
        .select({
          title: notes.title,
          content: notes.content,
          createdAt: notes.createdAt,
          authorName: users.name,
        })
        .from(notes)
        .leftJoin(users, eq(users.id, notes.authorId))
        .where(and(eq(notes.caseId, caseId), isNull(notes.deletedAt)))
        .orderBy(asc(notes.createdAt))
        .limit(MAX_NOTES),
      tx
        .select({
          description: timeEntries.description,
          durationSeconds: timeEntries.durationSeconds,
          billable: timeEntries.billable,
          startedAt: timeEntries.startedAt,
        })
        .from(timeEntries)
        .where(and(eq(timeEntries.caseId, caseId), isNull(timeEntries.deletedAt)))
        .orderBy(asc(timeEntries.startedAt))
        .limit(MAX_TIME_ENTRIES),
      tx
        .select({
          description: expenses.description,
          amount: expenses.amount,
          currency: expenses.currency,
          incurredOn: expenses.incurredOn,
        })
        .from(expenses)
        .where(and(eq(expenses.caseId, caseId), isNull(expenses.deletedAt)))
        .orderBy(asc(expenses.incurredOn))
        .limit(MAX_EXPENSES),
      tx
        .select({
          name: documents.name,
          ocrText: documents.ocrText,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(eq(documents.caseId, caseId), isNull(documents.deletedAt)))
        .orderBy(asc(documents.createdAt))
        .limit(MAX_DOCS),
    ]);

    const totalSeconds = timeRows.reduce((s, r) => s + r.durationSeconds, 0);
    const billableSeconds = timeRows
      .filter((r) => r.billable)
      .reduce((s, r) => s + r.durationSeconds, 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + Number(r.amount), 0);

    return {
      case: {
        code: head.code,
        title: head.title,
        matterType: head.matterType,
        status: head.status,
        description: head.description,
        court: head.court,
        counterpartyName: head.counterpartyName,
        leadLawyerName: head.leadLawyerName,
        openedAt: head.openedAt,
        closedAt: head.closedAt,
      },
      client: {
        displayName: head.clientName,
        legalName: head.clientLegalName,
      },
      events: eventRows,
      notes: noteRows.map((n) => ({
        title: n.title,
        text: tiptapToPlainText(n.content).slice(0, MAX_NOTE_CHARS),
        createdAt: n.createdAt,
        authorName: n.authorName,
      })),
      timeEntries: timeRows,
      expenses: expenseRows,
      documents: docRows.map((d) => ({
        name: d.name,
        ocrSnippet: d.ocrText
          ? d.ocrText.slice(0, MAX_DOC_OCR_CHARS)
          : null,
        createdAt: d.createdAt,
      })),
      totals: { totalSeconds, billableSeconds, totalExpenses },
    };
  });
}

function buildPrompt(ctx: CaseContext): string {
  const lines: string[] = [];
  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("es-DO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  lines.push(`# Caso ${ctx.case.code} — ${ctx.case.title}`);
  lines.push(`**Cliente:** ${ctx.client.displayName}${ctx.client.legalName && ctx.client.legalName !== ctx.client.displayName ? ` (${ctx.client.legalName})` : ""}`);
  lines.push(`**Materia:** ${ctx.case.matterType} · **Estado:** ${ctx.case.status}`);
  if (ctx.case.leadLawyerName) lines.push(`**Líder:** ${ctx.case.leadLawyerName}`);
  if (ctx.case.court) lines.push(`**Tribunal:** ${ctx.case.court}`);
  if (ctx.case.counterpartyName)
    lines.push(`**Contraparte:** ${ctx.case.counterpartyName}`);
  lines.push(`**Apertura:** ${fmtDate(ctx.case.openedAt)}${ctx.case.closedAt ? ` · **Cierre:** ${fmtDate(ctx.case.closedAt)}` : ""}`);

  if (ctx.case.description) {
    lines.push("\n## Descripción");
    lines.push(ctx.case.description);
  }

  lines.push("\n## Métricas");
  lines.push(
    `- Horas registradas: ${(ctx.totals.totalSeconds / 3600).toFixed(1)}h (facturables: ${(ctx.totals.billableSeconds / 3600).toFixed(1)}h)`,
  );
  lines.push(
    `- Gastos: ${ctx.totals.totalExpenses.toFixed(2)} (suma de ${ctx.expenses.length} gastos)`,
  );

  if (ctx.events.length) {
    lines.push(`\n## Eventos (${ctx.events.length})`);
    for (const e of ctx.events) {
      lines.push(`- **${fmtDate(e.startAt)}** · ${e.title}${e.location ? ` (${e.location})` : ""}${e.description ? `\n  ${e.description}` : ""}`);
    }
  }

  if (ctx.notes.length) {
    lines.push(`\n## Notas internas (${ctx.notes.length})`);
    for (const n of ctx.notes) {
      lines.push(
        `### ${n.title ?? "(sin título)"} — ${fmtDate(n.createdAt)}${n.authorName ? ` — ${n.authorName}` : ""}\n${n.text}`,
      );
    }
  }

  if (ctx.documents.length) {
    lines.push(`\n## Documentos (${ctx.documents.length})`);
    for (const d of ctx.documents) {
      lines.push(`- **${d.name}** (${fmtDate(d.createdAt)})`);
      if (d.ocrSnippet) {
        lines.push(`  > ${d.ocrSnippet.replace(/\n+/g, " ").slice(0, 600)}`);
      }
    }
  }

  if (ctx.timeEntries.length) {
    lines.push(`\n## Tiempos registrados (${ctx.timeEntries.length})`);
    for (const t of ctx.timeEntries.slice(0, 25)) {
      lines.push(
        `- ${fmtDate(t.startedAt)}: ${t.description ?? "(sin descripción)"} (${(t.durationSeconds / 3600).toFixed(2)}h${t.billable ? ", facturable" : ""})`,
      );
    }
  }

  if (ctx.expenses.length) {
    lines.push(`\n## Gastos (${ctx.expenses.length})`);
    for (const e of ctx.expenses.slice(0, 20)) {
      lines.push(
        `- ${fmtDate(e.incurredOn)}: ${e.description} — ${e.currency} ${Number(e.amount).toFixed(2)}`,
      );
    }
  }

  return lines.join("\n");
}
