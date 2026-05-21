// scripts/seed-demo-data.ts
//
// Pobla los 3 casos ya seedeados con tareas, facturas (mix pagadas /
// pendientes / morosas para que el reporte AR aging tenga vida),
// gastos avanzados, y una sugerencia de bienvenida en el dashboard.
//
// USO:
//   pnpm tsx scripts/seed-demo-data.ts <email>
//
// Por ejemplo:
//   pnpm tsx scripts/seed-demo-data.ts gendrick@ldplegal.com.do
//
// Idempotente: detecta lo que ya existe por título/número y no duplica.

import { config } from "dotenv";
config({ path: ".env" });

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { adminDb, adminPool } from "../lib/db/admin";
import {
  aiSuggestions,
  cases,
  expenses,
  invoices,
  tasks,
  users,
} from "../lib/db/schema";

function days(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`[seed-demo] ${msg}`);
    process.exit(1);
  }
}

async function main() {
  const email = process.argv[2];
  assert(email, "Usá: pnpm tsx scripts/seed-demo-data.ts <email>");

  // 1. Resolver firm + user.
  const [user] = await adminDb
    .select({ id: users.id, firmId: users.firmId, name: users.name })
    .from(users)
    .where(and(eq(users.email, email!.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  assert(user, `Usuario ${email} no encontrado.`);
  console.log(`[seed-demo] firm=${user!.firmId} user=${user!.name}`);

  // 2. Cargar los 3 casos seedeados.
  const targetCodes = ["2026-CORP-001", "2026-CIV-014", "2026-INM-008"];
  const seededCases = await adminDb
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.firmId, user!.firmId),
        inArray(cases.code, targetCodes),
        isNull(cases.deletedAt),
      ),
    );
  if (seededCases.length === 0) {
    console.log(
      "[seed-demo] ⚠ No encontré casos con códigos 2026-CORP-001 / 2026-CIV-014 / 2026-INM-008.",
    );
    console.log("[seed-demo] Corré primero: pnpm tsx scripts/seed-test-cases.ts " + email);
    process.exit(1);
  }
  const byCode = new Map(seededCases.map((c) => [c.code, c]));
  console.log(`[seed-demo] casos encontrados: ${seededCases.length}`);

  // 3. TASKS
  const taskSpecs: Array<{
    caseCode: string;
    title: string;
    description: string;
    dueIn: number;
    priority: "low" | "med" | "high";
    status: "todo" | "in_progress" | "done";
  }> = [
    // Caso asamblea
    {
      caseCode: "2026-CORP-001",
      title: "Solicitar nómina actualizada al cliente",
      description: "Necesitamos la lista completa de socios con cuotas para preparar el quórum.",
      dueIn: 2,
      priority: "high",
      status: "todo",
    },
    {
      caseCode: "2026-CORP-001",
      title: "Coordinar fecha de la asamblea con todos los socios",
      description: "Buscar disponibilidad común dentro de las próximas 3 semanas.",
      dueIn: 5,
      priority: "med",
      status: "in_progress",
    },
    {
      caseCode: "2026-CORP-001",
      title: "Revisar estatutos vigentes",
      description: "Verificar reglas de quórum y mayorías para los puntos del orden del día.",
      dueIn: -3,
      priority: "med",
      status: "done",
    },
    // Caso demanda desalojo
    {
      caseCode: "2026-CIV-014",
      title: "Preparar acto introductivo de demanda",
      description: "Redactar borrador para revisión del socio antes de protocolizar.",
      dueIn: 1,
      priority: "high",
      status: "in_progress",
    },
    {
      caseCode: "2026-CIV-014",
      title: "Solicitar certificación del Registro de Títulos",
      description: "Para acreditar la propiedad del demandante.",
      dueIn: 7,
      priority: "med",
      status: "todo",
    },
    {
      caseCode: "2026-CIV-014",
      title: "Verificar últimos pagos del arrendatario",
      description: "El cliente dice que el último pago parcial fue en febrero — confirmá fechas y montos exactos.",
      dueIn: -1,
      priority: "high",
      status: "todo",
    },
    // Caso compraventa
    {
      caseCode: "2026-INM-008",
      title: "Verificar certificación de cargas del inmueble",
      description: "Confirmar que no hay hipotecas ni embargos antes del cierre.",
      dueIn: 3,
      priority: "high",
      status: "in_progress",
    },
    {
      caseCode: "2026-INM-008",
      title: "Coordinar firma con notario",
      description: "Dr. Méndez tiene disponibilidad jueves o viernes.",
      dueIn: 6,
      priority: "med",
      status: "todo",
    },
    {
      caseCode: "2026-INM-008",
      title: "Recibir inicial del 30%",
      description: "Transferencia ya confirmada por el cliente. Solo verificar acreditación.",
      dueIn: -5,
      priority: "med",
      status: "done",
    },
  ];

  let tasksInserted = 0;
  for (const spec of taskSpecs) {
    const caso = byCode.get(spec.caseCode);
    if (!caso) continue;
    // Idempotencia por título + caso.
    const [exists] = await adminDb
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.firmId, user!.firmId),
          eq(tasks.caseId, caso.id),
          eq(tasks.title, spec.title),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (exists) continue;
    await adminDb.insert(tasks).values({
      firmId: user!.firmId,
      caseId: caso.id,
      title: spec.title,
      description: spec.description,
      assigneeId: user!.id,
      dueAt: days(spec.dueIn),
      priority: spec.priority,
      status: spec.status,
      completedAt: spec.status === "done" ? days(spec.dueIn) : null,
      createdBy: user!.id,
    });
    tasksInserted++;
  }
  console.log(`[seed-demo] tasks insertadas: ${tasksInserted}`);

  // 4. INVOICES (mix de paid / pending / overdue / draft)
  const invoiceSpecs: Array<{
    number: string;
    caseCode: string;
    issuedDaysAgo: number;
    dueDaysFromNow: number;
    subtotal: number;
    itbisRate: number;
    status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
    balance: number;
    paidDaysAgo?: number;
  }> = [
    // Caso CORP: factura pagada hace tiempo
    {
      number: "INV-2026-001",
      caseCode: "2026-CORP-001",
      issuedDaysAgo: 45,
      dueDaysFromNow: -15,
      subtotal: 45000,
      itbisRate: 0.18,
      status: "paid",
      balance: 0,
      paidDaysAgo: 10,
    },
    // Caso CORP: factura recién emitida, pendiente
    {
      number: "INV-2026-002",
      caseCode: "2026-CORP-001",
      issuedDaysAgo: 5,
      dueDaysFromNow: 25,
      subtotal: 35000,
      itbisRate: 0.18,
      status: "sent",
      balance: 35000 * 1.18,
    },
    // Caso CIV: factura morosa (vencida hace 35 días)
    {
      number: "INV-2026-003",
      caseCode: "2026-CIV-014",
      issuedDaysAgo: 65,
      dueDaysFromNow: -35,
      subtotal: 60000,
      itbisRate: 0.18,
      status: "sent",
      balance: 60000 * 1.18,
    },
    // Caso CIV: factura muy vencida (>90 días) - aging crítico
    {
      number: "INV-2026-004",
      caseCode: "2026-CIV-014",
      issuedDaysAgo: 120,
      dueDaysFromNow: -95,
      subtotal: 25000,
      itbisRate: 0.18,
      status: "sent",
      balance: 25000 * 1.18,
    },
    // Caso INM: pago parcial (50% pagado)
    {
      number: "INV-2026-005",
      caseCode: "2026-INM-008",
      issuedDaysAgo: 20,
      dueDaysFromNow: 10,
      subtotal: 120000,
      itbisRate: 0.18,
      status: "partial",
      balance: (120000 * 1.18) / 2,
    },
    // Borrador (Gabriel puede emitirla a mano para probar el flow)
    {
      number: "INV-2026-006",
      caseCode: "2026-INM-008",
      issuedDaysAgo: 1,
      dueDaysFromNow: 30,
      subtotal: 18000,
      itbisRate: 0.18,
      status: "draft",
      balance: 18000 * 1.18,
    },
  ];

  let invoicesInserted = 0;
  for (const spec of invoiceSpecs) {
    const caso = byCode.get(spec.caseCode);
    if (!caso) continue;
    // Idempotencia por número.
    const [exists] = await adminDb
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.firmId, user!.firmId),
          eq(invoices.number, spec.number),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);
    if (exists) continue;
    const itbis = spec.subtotal * spec.itbisRate;
    const total = spec.subtotal + itbis;
    await adminDb.insert(invoices).values({
      firmId: user!.firmId,
      clientId: caso.clientId,
      caseId: caso.id,
      number: spec.number,
      issuedOn: days(-spec.issuedDaysAgo),
      dueOn: days(spec.dueDaysFromNow),
      status: spec.status,
      subtotal: spec.subtotal.toFixed(2),
      itbisAmount: itbis.toFixed(2),
      total: total.toFixed(2),
      balance: spec.balance.toFixed(2),
      currency: "DOP",
      createdBy: user!.id,
      sentAt:
        spec.status === "sent" || spec.status === "partial" || spec.status === "paid"
          ? days(-spec.issuedDaysAgo + 1)
          : null,
      paidAt: spec.paidDaysAgo !== undefined ? days(-spec.paidDaysAgo) : null,
    });
    invoicesInserted++;
  }
  console.log(`[seed-demo] invoices insertadas: ${invoicesInserted}`);

  // 5. EXPENSES (gastos avanzados — alguno billable, otro draft)
  const expenseSpecs: Array<{
    caseCode: string;
    description: string;
    amount: number;
    daysAgo: number;
    status: "draft" | "approved" | "invoiced";
    billable: boolean;
  }> = [
    {
      caseCode: "2026-CIV-014",
      description: "Honorarios de alguacil para notificación",
      amount: 2500,
      daysAgo: 12,
      status: "approved",
      billable: true,
    },
    {
      caseCode: "2026-CIV-014",
      description: "Copias certificadas de contrato de alquiler",
      amount: 800,
      daysAgo: 8,
      status: "approved",
      billable: true,
    },
    {
      caseCode: "2026-INM-008",
      description: "Certificación de cargas — Registro de Títulos",
      amount: 1200,
      daysAgo: 4,
      status: "draft",
      billable: true,
    },
    {
      caseCode: "2026-CORP-001",
      description: "Sellos de la Cámara de Comercio para el acta",
      amount: 1500,
      daysAgo: 2,
      status: "draft",
      billable: true,
    },
  ];

  let expensesInserted = 0;
  for (const spec of expenseSpecs) {
    const caso = byCode.get(spec.caseCode);
    if (!caso) continue;
    const [exists] = await adminDb
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.firmId, user!.firmId),
          eq(expenses.caseId, caso.id),
          eq(expenses.description, spec.description),
          isNull(expenses.deletedAt),
        ),
      )
      .limit(1);
    if (exists) continue;
    await adminDb.insert(expenses).values({
      firmId: user!.firmId,
      caseId: caso.id,
      userId: user!.id,
      description: spec.description,
      amount: spec.amount.toFixed(2),
      currency: "DOP",
      incurredOn: days(-spec.daysAgo),
      billable: spec.billable,
      status: spec.status,
    });
    expensesInserted++;
  }
  console.log(`[seed-demo] expenses insertados: ${expensesInserted}`);

  // 6. AI SUGGESTIONS — una de bienvenida en el dashboard para cada usuario
  // staff existente. Sólo si no tienen ya una pending del mismo kind.
  const staff = await adminDb
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.firmId, user!.firmId),
        inArray(users.role, ["admin", "partner", "lawyer", "paralegal"]),
        isNull(users.deletedAt),
      ),
    );

  let suggestionsInserted = 0;
  for (const s of staff) {
    const [exists] = await adminDb
      .select({ id: aiSuggestions.id })
      .from(aiSuggestions)
      .where(
        and(
          eq(aiSuggestions.firmId, user!.firmId),
          eq(aiSuggestions.userId, s.id),
          eq(aiSuggestions.kind, "welcome_tour"),
        ),
      )
      .limit(1);
    if (exists) continue;
    await adminDb.insert(aiSuggestions).values({
      firmId: user!.firmId,
      userId: s.id,
      kind: "welcome_tour",
      title: `Bienvenido/a, ${s.name.split(" ")[0]}`,
      body:
        "Apretá Cmd+J (o Ctrl+J) dentro de cualquier expediente para abrir el asistente de IA. Pedile que lea un documento, redacte una carta, cree un evento o haga un resumen del caso.",
      href: "/casos",
      severity: "info",
      expiresAt: days(30),
    });
    suggestionsInserted++;
  }
  console.log(`[seed-demo] sugerencias de bienvenida insertadas: ${suggestionsInserted}`);

  console.log("\n[seed-demo] 🎉 Demo data listo.");
  console.log(`  Tasks:        ${tasksInserted}`);
  console.log(`  Invoices:     ${invoicesInserted}`);
  console.log(`  Expenses:     ${expensesInserted}`);
  console.log(`  Sugerencias:  ${suggestionsInserted}`);
}

main()
  .then(async () => {
    await adminPool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed-demo] FATAL:", err);
    await adminPool.end().catch(() => {});
    process.exit(1);
  });

void sql;
