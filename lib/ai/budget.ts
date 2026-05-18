// F7 bloque 4 — Presupuesto IA por firm.
//
// Configuración: cada firm fija un techo mensual en USD via `firms.settings.aiBudget`:
//   {
//     monthlyUsd: 50.0,             // null/unset = sin tope (advertencias off)
//     warnThresholds: [0.7, 0.9],   // por defecto 70% y 90%
//     hardCap: true,                 // true = bloquea calls al pasar 100%
//   }
//
// Una sola query agregada (índice ai_usage_firm_created_idx la hace ~1 ms
// hasta varios miles de filas/mes). Se llama desde runPrompt antes de
// ejecutar el modelo; si el firm pasó el 100% con hardCap=true, devuelve
// `denied` y la UI muestra al usuario que el firm agotó el presupuesto.
//
// Las advertencias 70/90/100% se disparan vía `notify()` la primera vez
// que se cruza cada umbral en el mes (anti-spam: usamos una sugerencia
// pending en ai_suggestions como dedupe).

import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { aiSuggestions, aiUsage, firms, users } from "@/lib/db/schema";

export type AiBudgetConfig = {
  monthlyUsd: number | null;
  warnThresholds: number[];
  hardCap: boolean;
};

const DEFAULT_THRESHOLDS = [0.7, 0.9];

export const DEFAULT_BUDGET: AiBudgetConfig = {
  monthlyUsd: null,
  warnThresholds: DEFAULT_THRESHOLDS,
  hardCap: false,
};

// Pure: reads firms.settings.aiBudget jsonb and normalises it.
export async function getFirmBudget(firmId: string): Promise<AiBudgetConfig> {
  const [row] = await adminDb
    .select({ settings: firms.settings })
    .from(firms)
    .where(eq(firms.id, firmId))
    .limit(1);
  const raw = (row?.settings as Record<string, unknown> | undefined)?.aiBudget;
  if (!raw || typeof raw !== "object") return DEFAULT_BUDGET;
  const r = raw as Record<string, unknown>;
  const monthly = typeof r.monthlyUsd === "number" && r.monthlyUsd > 0 ? r.monthlyUsd : null;
  const thresholds = Array.isArray(r.warnThresholds)
    ? r.warnThresholds.filter((x): x is number => typeof x === "number" && x > 0 && x < 1)
    : DEFAULT_THRESHOLDS;
  const hardCap = r.hardCap === true;
  return { monthlyUsd: monthly, warnThresholds: thresholds, hardCap };
}

// One-shot upsert of the firm's budget config. Other fields in
// firms.settings are preserved.
export async function setFirmBudget(
  firmId: string,
  cfg: Partial<AiBudgetConfig>,
): Promise<AiBudgetConfig> {
  const current = await getFirmBudget(firmId);
  const next: AiBudgetConfig = {
    monthlyUsd: cfg.monthlyUsd ?? current.monthlyUsd,
    warnThresholds: cfg.warnThresholds ?? current.warnThresholds,
    hardCap: cfg.hardCap ?? current.hardCap,
  };
  // Merge into existing settings using jsonb_set semantics via Drizzle's
  // sql template (atomic — never overwrite the whole jsonb).
  await adminDb
    .update(firms)
    .set({
      settings: sql`COALESCE(${firms.settings}, '{}'::jsonb)
        || jsonb_build_object('aiBudget', ${JSON.stringify(next)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firmId));
  return next;
}

function monthStartUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type AiBudgetStatus = {
  config: AiBudgetConfig;
  monthSpendUsd: number;
  monthInputTokens: number;
  monthOutputTokens: number;
  callCount: number;
  // null si no hay tope; en [0, ∞) si lo hay.
  pctUsed: number | null;
  // 'ok' | 'warn70' | 'warn90' | 'over' | 'blocked'
  state: "ok" | "warn70" | "warn90" | "over" | "blocked";
};

export async function getBudgetStatus(firmId: string): Promise<AiBudgetStatus> {
  const cfg = await getFirmBudget(firmId);
  const since = monthStartUtc();

  const [row] = await adminDb
    .select({
      cost: sql<string | null>`COALESCE(SUM(${aiUsage.costUsd}), 0)::text`,
      inputTokens: sql<number>`COALESCE(SUM(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`COALESCE(SUM(${aiUsage.outputTokens}), 0)::int`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.firmId, firmId), gte(aiUsage.createdAt, since)));

  const monthSpendUsd = Number(row?.cost ?? 0);
  const monthInputTokens = Number(row?.inputTokens ?? 0);
  const monthOutputTokens = Number(row?.outputTokens ?? 0);
  const callCount = Number(row?.count ?? 0);

  let pctUsed: number | null = null;
  let state: AiBudgetStatus["state"] = "ok";
  if (cfg.monthlyUsd) {
    pctUsed = monthSpendUsd / cfg.monthlyUsd;
    if (pctUsed >= 1) state = cfg.hardCap ? "blocked" : "over";
    else if (pctUsed >= 0.9) state = "warn90";
    else if (pctUsed >= 0.7) state = "warn70";
  }
  return {
    config: cfg,
    monthSpendUsd,
    monthInputTokens,
    monthOutputTokens,
    callCount,
    pctUsed,
    state,
  };
}

// Llamado desde runPrompt antes de invocar a Claude. Devuelve `denied`
// solo si hay tope con hardCap y ya se cruzó. La advertencia (suggestion +
// notify) se publica en `recordSpendAndMaybeWarn` después de la llamada,
// porque hasta no saber cuánto costó esta call no sabemos qué bucket cruzamos.
export async function preflightBudget(
  firmId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string; status: AiBudgetStatus }> {
  const status = await getBudgetStatus(firmId);
  if (status.state === "blocked") {
    return {
      allowed: false,
      reason: `La firma ya consumió el presupuesto IA mensual (US$${status.config.monthlyUsd?.toFixed(2)}). Pídele a un administrador que aumente el límite en Configuración → IA.`,
      status,
    };
  }
  return { allowed: true };
}

// Breakdown del mes en curso por socio. Útil para el dashboard "consumo
// por socio" que pide Gabriel — cada socio puede tener un sub-tope (de
// momento sólo informativo: no bloqueamos).
export type UserSpend = {
  userId: string;
  userName: string | null;
  spendUsd: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
};

export async function getSpendByUser(firmId: string): Promise<UserSpend[]> {
  const since = monthStartUtc();
  const rows = await adminDb
    .select({
      userId: aiUsage.userId,
      userName: users.name,
      cost: sql<string | null>`COALESCE(SUM(${aiUsage.costUsd}), 0)::text`,
      inputTokens: sql<number>`COALESCE(SUM(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`COALESCE(SUM(${aiUsage.outputTokens}), 0)::int`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(aiUsage)
    .leftJoin(users, eq(users.id, aiUsage.userId))
    .where(and(eq(aiUsage.firmId, firmId), gte(aiUsage.createdAt, since)))
    .groupBy(aiUsage.userId, users.name);
  return rows
    .filter((r) => r.userId !== null)
    .map((r) => ({
      userId: r.userId as string,
      userName: r.userName,
      spendUsd: Number(r.cost ?? 0),
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      callCount: Number(r.count ?? 0),
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd);
}

// Breakdown por feature (matter_chat, doc_generate, event_parse...). Útil
// para el reporte mensual ROI: cuánto se gasta en cada categoría.
export type FeatureSpend = {
  feature: string;
  spendUsd: number;
  callCount: number;
};

export async function getSpendByFeature(firmId: string): Promise<FeatureSpend[]> {
  const since = monthStartUtc();
  const rows = await adminDb
    .select({
      feature: aiUsage.feature,
      cost: sql<string | null>`COALESCE(SUM(${aiUsage.costUsd}), 0)::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.firmId, firmId), gte(aiUsage.createdAt, since)))
    .groupBy(aiUsage.feature);
  return rows
    .map((r) => ({
      feature: r.feature ?? "unknown",
      spendUsd: Number(r.cost ?? 0),
      callCount: Number(r.count ?? 0),
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd);
}

// ROI rough estimate: 25 min ahorrados por documento generado, 5 min por
// evento creado desde chat, 10 min por carta. Multiplicado por la tarifa
// horaria promedio del firm para dar el "ahorro" en USD.
// Es una aproximación — Gabriel lo pide explícito en la spec para
// justificar el costo de la IA frente a Marc y Jorge.
export type RoiSummary = {
  monthSpendUsd: number;
  docsGenerated: number;
  eventsParsed: number;
  estimatedHoursSaved: number;
  estimatedSavedUsd: number;
  netSavingUsd: number;
};

export async function getRoiSummary(
  firmId: string,
  avgHourlyRateUsd: number = 80,
): Promise<RoiSummary> {
  const since = monthStartUtc();
  const status = await getBudgetStatus(firmId);
  const [counts] = await adminDb
    .select({
      docs: sql<number>`COUNT(*) FILTER (WHERE ${aiUsage.feature} = 'doc_generate')::int`,
      events: sql<number>`COUNT(*) FILTER (WHERE ${aiUsage.feature} = 'event_parse')::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.firmId, firmId), gte(aiUsage.createdAt, since)));
  const docsGenerated = Number(counts?.docs ?? 0);
  const eventsParsed = Number(counts?.events ?? 0);
  const estimatedHoursSaved = (docsGenerated * 25 + eventsParsed * 5) / 60;
  const estimatedSavedUsd = estimatedHoursSaved * avgHourlyRateUsd;
  return {
    monthSpendUsd: status.monthSpendUsd,
    docsGenerated,
    eventsParsed,
    estimatedHoursSaved,
    estimatedSavedUsd,
    netSavingUsd: estimatedSavedUsd - status.monthSpendUsd,
  };
}

// Post-call hook. Compara umbrales antes/después de la última call y, si
// se cruzó alguno por primera vez este mes, crea una sugerencia pending
// dirigida a todos los admins del firm. Idempotente: si ya hay una
// sugerencia pending del mismo `kind` para este mes, no duplica.
export async function recordSpendAndMaybeWarn(firmId: string): Promise<void> {
  const status = await getBudgetStatus(firmId);
  if (status.pctUsed === null || status.config.monthlyUsd === null) return;

  type Bucket = { threshold: number; kind: string; severity: "info" | "warn" | "critical" };
  const buckets: Bucket[] = [
    { threshold: 0.7, kind: "ai_budget_warn_70", severity: "info" },
    { threshold: 0.9, kind: "ai_budget_warn_90", severity: "warn" },
    { threshold: 1.0, kind: "ai_budget_over_100", severity: "critical" },
  ];

  const monthLabel = new Date().toISOString().slice(0, 7); // 2026-05
  for (const b of buckets) {
    if (status.pctUsed < b.threshold) continue;
    const fingerprintKind = `${b.kind}:${monthLabel}`;
    // Skip if any admin already has a pending suggestion of this kind for
    // this month.
    const [existing] = await adminDb
      .select({ id: aiSuggestions.id })
      .from(aiSuggestions)
      .where(
        and(
          eq(aiSuggestions.firmId, firmId),
          eq(aiSuggestions.kind, fingerprintKind),
          eq(aiSuggestions.status, "pending"),
        ),
      )
      .limit(1);
    if (existing) continue;

    // Find admin/partner users to notify.
    const admins = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.firmId, firmId),
          sql`${users.role} IN ('admin', 'partner')`,
          sql`${users.deletedAt} IS NULL`,
        ),
      );
    if (admins.length === 0) continue;

    const pct = Math.round(status.pctUsed * 100);
    const title =
      b.threshold >= 1
        ? `Presupuesto IA agotado (${pct}%)`
        : `Presupuesto IA al ${pct}%`;
    const body =
      b.threshold >= 1
        ? `La firma consumió US$${status.monthSpendUsd.toFixed(2)} de US$${status.config.monthlyUsd.toFixed(2)} este mes. ${status.config.hardCap ? "Las nuevas consultas a la IA están bloqueadas hasta el próximo mes o hasta que aumentes el límite." : "Las consultas siguen funcionando porque el hard-cap está desactivado, pero estás sobrepasando el presupuesto."}`
        : `Llevas US$${status.monthSpendUsd.toFixed(2)} de US$${status.config.monthlyUsd.toFixed(2)} este mes en consultas a la IA. ${b.threshold >= 0.9 ? "Te queda poco margen — considerá pausar features no críticas." : ""}`;

    await adminDb.insert(aiSuggestions).values(
      admins.map((a) => ({
        firmId,
        userId: a.id,
        kind: fingerprintKind,
        title,
        body,
        href: "/configuracion?tab=ia",
        severity: b.severity,
        status: "pending" as const,
        metadata: {
          monthSpendUsd: status.monthSpendUsd,
          monthlyUsd: status.config.monthlyUsd,
          pctUsed: status.pctUsed,
          callCount: status.callCount,
        },
      })),
    );
  }
}
