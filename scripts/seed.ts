// scripts/seed.ts
//
// Seeds the database with realistic-but-fictitious Dominican firm data so
// that day-1 testing reflects the shape of real usage:
//   - 2 firms with `America/Santo_Domingo` tz and DOP currency.
//   - 5 users per firm (1 admin, 1 partner, 2 lawyers, 1 paralegal) with
//     Dominican names; password for every seed user is `password123`.
//   - 9 clientes per firm: mix individual (cédula) and corporate (RNC).
//   - 13 casos per firm across all matter types, mix open/closed,
//     INCLUDING ONE caso with visibility=restricted assigned to a single
//     partner — used by the cross-tenant tests to verify the
//     case_assignments authorization layer (§ 9.2).
//
// Uses the admin connection because seeds span multiple firms, and RLS
// scoped by app.firm_id would block cross-firm inserts in one transaction.
// Documented in DECISIONS.md.

import { config } from "dotenv";
config({ path: ".env" });

import { sql } from "drizzle-orm";
import { auth } from "../lib/auth/server";
import { adminDb, adminPool } from "../lib/db/admin";
import {
  caseAssignments,
  cases,
  clients,
  events,
  expenses,
  firms,
  tasks,
  timeEntries,
  users,
} from "../lib/db/schema";

const SEED_PASSWORD = "password123";

type Role = "admin" | "partner" | "lawyer" | "paralegal";

async function createUserViaAuth(input: {
  email: string;
  name: string;
  firmId: string;
  role: Role;
}): Promise<string> {
  // Se usa internalAdapter (vía servidor, de confianza) y NO
  // auth.api.signUpEmail (vía pública HTTP).
  //
  // El hook databaseHooks.user.create.before de lib/auth/server.ts rechaza
  // toda alta pública contra una firm que ya tenga usuarios: es la defensa
  // contra escalada de privilegios (alguien con la URL de signup podría
  // inyectar role:"admin" + un firmId conocido y plantarse en la firma de
  // otro). Ese hook solo deja pasar la vía interna, donde context === null.
  //
  // Con signUpEmail el seed moría en el segundo usuario de cada firm,
  // dejando la base a medio sembrar. Mismo patron que invitarStaffAction.
  const ctx = await auth.$context;
  const email = input.email.toLowerCase();

  const created = await ctx.internalAdapter.createUser({
    email,
    name: input.name,
    emailVerified: false,
    firmId: input.firmId,
    role: input.role,
  } as Parameters<typeof ctx.internalAdapter.createUser>[0]);
  if (!created?.id) {
    throw new Error(`createUser returned no user for ${input.email}`);
  }

  // Sin la cuenta "credential" el usuario existe pero no puede iniciar sesión.
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(SEED_PASSWORD),
  });

  return created.id;
}

function pad3(n: number) {
  return n.toString().padStart(3, "0");
}

function pickOne<T>(arr: readonly T[]): T {
  const i = Math.floor(Math.random() * arr.length);
  const v = arr[i];
  if (v === undefined) throw new Error("pickOne: empty array");
  return v;
}

async function main() {
  console.log("[seed] Truncating existing data...");
  await adminDb.execute(sql`
    TRUNCATE
      "active_timers",
      "expenses",
      "events",
      "tasks",
      "time_entries",
      "case_assignments",
      "case_counters",
      "cases",
      "clients",
      "verifications",
      "accounts",
      "sessions",
      "users",
      "firms"
    RESTART IDENTITY CASCADE
  `);

  console.log("[seed] Creating firms...");
  const insertedFirms = await adminDb
    .insert(firms)
    .values([
      {
        name: "Bufete Almonte & Reyes",
        rnc: "131-25801-9",
        address: "Av. Lope de Vega 29, Torre Novo Centro, Naco, Santo Domingo",
        timezone: "America/Santo_Domingo",
        defaultCurrency: "DOP",
      },
      {
        name: "Pichardo Legal Group",
        rnc: "131-49823-4",
        address: "Av. Roberto Pastoriza 158, Piantini, Santo Domingo",
        timezone: "America/Santo_Domingo",
        defaultCurrency: "DOP",
      },
    ])
    .returning({ id: firms.id, name: firms.name });

  const firmA = insertedFirms[0];
  const firmB = insertedFirms[1];
  if (!firmA || !firmB) throw new Error("[seed] Failed to insert firms");

  console.log("[seed] Creating users (via better-auth signUpEmail)...");
  const SEED_USERS_A: Array<{ email: string; name: string; role: Role }> = [
    { email: "carmen.almonte@almontereyes.do", name: "Carmen Almonte", role: "admin" },
    { email: "rafael.reyes@almontereyes.do", name: "Rafael Reyes", role: "partner" },
    { email: "luis.peralta@almontereyes.do", name: "Luis Peralta", role: "lawyer" },
    { email: "andrea.santos@almontereyes.do", name: "Andrea Santos", role: "lawyer" },
    { email: "gabriela.diaz@almontereyes.do", name: "Gabriela Díaz", role: "paralegal" },
  ];
  const SEED_USERS_B: Array<{ email: string; name: string; role: Role }> = [
    { email: "francisco.pichardo@pichardolegal.do", name: "Francisco Pichardo", role: "admin" },
    { email: "mariana.guzman@pichardolegal.do", name: "Mariana Guzmán", role: "partner" },
    { email: "ricardo.fernandez@pichardolegal.do", name: "Ricardo Fernández", role: "lawyer" },
    { email: "patricia.veras@pichardolegal.do", name: "Patricia Veras", role: "lawyer" },
    { email: "jose.castillo@pichardolegal.do", name: "José Castillo", role: "paralegal" },
  ];

  const userIdsA: Array<{ id: string; role: Role; name: string }> = [];
  for (const u of SEED_USERS_A) {
    const id = await createUserViaAuth({ ...u, firmId: firmA.id });
    userIdsA.push({ id, role: u.role, name: u.name });
  }
  const userIdsB: Array<{ id: string; role: Role; name: string }> = [];
  for (const u of SEED_USERS_B) {
    const id = await createUserViaAuth({ ...u, firmId: firmB.id });
    userIdsB.push({ id, role: u.role, name: u.name });
  }

  console.log("[seed] Creating clientes...");
  const insertedClientsA = await adminDb
    .insert(clients)
    .values([
      {
        firmId: firmA.id,
        type: "corporate",
        displayName: "Industrias Caribeñas, S.R.L.",
        legalName: "Industrias Caribeñas, S.R.L.",
        taxIdType: "rnc",
        taxId: "130-12345-6",
        primaryContactName: "Pedro Méndez",
        email: "pmendez@industriascaribenas.do",
        phone: "+1 809 555 1102",
        address: "Zona Franca Industrial Santo Domingo",
        status: "active",
        createdBy: userIdsA[0]?.id,
      },
      {
        firmId: firmA.id,
        type: "corporate",
        displayName: "Hotelera Punta Cana",
        legalName: "Hotelera Punta Cana, S.A.",
        taxIdType: "rnc",
        taxId: "131-09876-5",
        primaryContactName: "Lucía Báez",
        email: "lbaez@hpcana.do",
        phone: "+1 809 552 8800",
        address: "Bávaro, Punta Cana",
        status: "active",
        createdBy: userIdsA[1]?.id,
      },
      {
        firmId: firmA.id,
        type: "individual",
        displayName: "Eduardo Marte Polanco",
        taxIdType: "cedula",
        taxId: "001-1234567-8",
        email: "emarte@gmail.com",
        phone: "+1 829 444 1010",
        address: "C/ El Conde 45, Santo Domingo",
        status: "active",
        createdBy: userIdsA[2]?.id,
      },
      {
        firmId: firmA.id,
        type: "corporate",
        displayName: "Constructora del Cibao",
        legalName: "Constructora del Cibao, S.R.L.",
        taxIdType: "rnc",
        taxId: "131-22443-7",
        primaryContactName: "Norberto Vásquez",
        email: "nvasquez@cibaoconstruct.do",
        phone: "+1 809 580 2210",
        address: "Av. 27 de Febrero, Santiago",
        status: "active",
        createdBy: userIdsA[1]?.id,
      },
      {
        firmId: firmA.id,
        type: "individual",
        displayName: "María Cristina Acosta",
        taxIdType: "cedula",
        taxId: "402-9988776-1",
        email: "mc.acosta@hotmail.com",
        phone: "+1 809 666 4422",
        address: "La Romana",
        status: "prospect",
        createdBy: userIdsA[2]?.id,
      },
      {
        firmId: firmA.id,
        type: "corporate",
        displayName: "Café Dominicano",
        legalName: "Productora Café Dominicano, S.A.",
        taxIdType: "rnc",
        taxId: "131-33112-0",
        primaryContactName: "Inés Mejía",
        email: "imejia@cafedo.do",
        phone: "+1 809 540 1818",
        address: "Av. Núñez de Cáceres, Santo Domingo",
        status: "active",
        createdBy: userIdsA[0]?.id,
      },
      {
        firmId: firmA.id,
        type: "individual",
        displayName: "Joaquín Tavárez",
        taxIdType: "cedula",
        taxId: "031-3344556-2",
        email: "joaquin.tavarez@outlook.com",
        phone: "+1 829 711 9090",
        address: "Santiago",
        status: "active",
        createdBy: userIdsA[3]?.id,
      },
      {
        firmId: firmA.id,
        type: "corporate",
        displayName: "Distribuidora Ámbar",
        legalName: "Distribuidora Ámbar, S.R.L.",
        taxIdType: "rnc",
        taxId: "130-66554-3",
        primaryContactName: "Yokasta Núñez",
        email: "ynunez@ambardist.do",
        phone: "+1 809 222 7755",
        status: "active",
        createdBy: userIdsA[1]?.id,
      },
      {
        firmId: firmA.id,
        type: "individual",
        displayName: "Sofía Pimentel",
        taxIdType: "cedula",
        taxId: "001-7788990-3",
        email: "sofia.pimentel@me.com",
        phone: "+1 809 111 2233",
        status: "closed",
        createdBy: userIdsA[2]?.id,
      },
    ])
    .returning({ id: clients.id });

  const insertedClientsB = await adminDb
    .insert(clients)
    .values([
      {
        firmId: firmB.id,
        type: "corporate",
        displayName: "Bahía Real Estate",
        legalName: "Bahía Real Estate Group, S.A.",
        taxIdType: "rnc",
        taxId: "131-44556-2",
        primaryContactName: "Juan Carlos Rosario",
        email: "jrosario@bahiare.do",
        phone: "+1 809 333 4400",
        address: "Cap Cana, Higüey",
        status: "active",
        createdBy: userIdsB[0]?.id,
      },
      {
        firmId: firmB.id,
        type: "corporate",
        displayName: "Banco Atlántico",
        legalName: "Banco Atlántico, S.A.",
        taxIdType: "rnc",
        taxId: "101-99887-1",
        primaryContactName: "Mónica Brito",
        email: "mbrito@bancoatlantico.do",
        phone: "+1 809 200 3000",
        address: "Torre Acrópolis, Santo Domingo",
        status: "active",
        createdBy: userIdsB[1]?.id,
      },
      {
        firmId: firmB.id,
        type: "individual",
        displayName: "Roberto Pou",
        taxIdType: "cedula",
        taxId: "001-2233445-9",
        email: "rpou@gmail.com",
        phone: "+1 829 555 8090",
        address: "Arroyo Hondo, Santo Domingo",
        status: "active",
        createdBy: userIdsB[2]?.id,
      },
      {
        firmId: firmB.id,
        type: "corporate",
        displayName: "Energías del Este",
        legalName: "Energías del Este, S.R.L.",
        taxIdType: "rnc",
        taxId: "131-77665-8",
        primaryContactName: "Hugo Cabrera",
        email: "hcabrera@enesteste.do",
        phone: "+1 809 712 1010",
        address: "San Pedro de Macorís",
        status: "active",
        createdBy: userIdsB[1]?.id,
      },
      {
        firmId: firmB.id,
        type: "individual",
        displayName: "Carolina Henríquez",
        taxIdType: "cedula",
        taxId: "402-3344556-7",
        email: "carolina.henriquez@yahoo.com",
        phone: "+1 809 888 1212",
        address: "La Romana",
        status: "prospect",
        createdBy: userIdsB[3]?.id,
      },
      {
        firmId: firmB.id,
        type: "corporate",
        displayName: "Tabacalera del Norte",
        legalName: "Tabacalera del Norte, S.A.",
        taxIdType: "rnc",
        taxId: "130-55443-3",
        primaryContactName: "Felipe Espinal",
        email: "fespinal@tabnorte.do",
        phone: "+1 809 583 4040",
        address: "Tamboril, Santiago",
        status: "active",
        createdBy: userIdsB[0]?.id,
      },
      {
        firmId: firmB.id,
        type: "individual",
        displayName: "Anabel Castro",
        taxIdType: "cedula",
        taxId: "031-9988776-4",
        email: "anabel.castro@outlook.com",
        phone: "+1 829 444 5566",
        address: "Santiago",
        status: "active",
        createdBy: userIdsB[2]?.id,
      },
      {
        firmId: firmB.id,
        type: "corporate",
        displayName: "Logística Caribeña",
        legalName: "Logística Caribeña, S.R.L.",
        taxIdType: "rnc",
        taxId: "131-11223-4",
        primaryContactName: "Claudia Suero",
        email: "csuero@logicaribe.do",
        phone: "+1 809 567 7777",
        status: "active",
        createdBy: userIdsB[1]?.id,
      },
      {
        firmId: firmB.id,
        type: "individual",
        displayName: "Manuel Estrella",
        taxIdType: "cedula",
        taxId: "001-4455667-7",
        email: "mestrella@hotmail.com",
        phone: "+1 829 333 1111",
        status: "closed",
        createdBy: userIdsB[3]?.id,
      },
    ])
    .returning({ id: clients.id });

  console.log("[seed] Creating casos...");

  type CaseSeed = {
    title: string;
    matterType: "civil" | "corporate" | "real_estate" | "criminal" | "labor" | "tax" | "administrative" | "other";
    status: "open" | "on_hold" | "closed";
    billingMode: "hourly" | "flat_fee" | "retainer" | "contingency";
    description?: string;
    counterpartyName?: string;
    counterpartyTaxId?: string;
    flatFeeAmount?: string;
    tags?: string[];
    visibility?: "firm" | "restricted";
  };

  const CASES_A: CaseSeed[] = [
    { title: "Demanda en cobro de pesos", matterType: "civil", status: "open", billingMode: "hourly", counterpartyName: "Inversiones Río Verde, S.R.L.", counterpartyTaxId: "131-77711-2", tags: ["urgente"] },
    { title: "Constitución de S.R.L.", matterType: "corporate", status: "closed", billingMode: "flat_fee", flatFeeAmount: "65000.00", tags: ["constitución"] },
    { title: "Compraventa de inmueble en Bávaro", matterType: "real_estate", status: "open", billingMode: "flat_fee", flatFeeAmount: "120000.00" },
    { title: "Demanda laboral por desahucio", matterType: "labor", status: "open", billingMode: "hourly", counterpartyName: "Restaurante La Casona", tags: ["laboral"] },
    { title: "Recurso ante TST por ITBIS", matterType: "tax", status: "on_hold", billingMode: "hourly" },
    { title: "Defensa penal preliminar", matterType: "criminal", status: "open", billingMode: "retainer", visibility: "restricted", description: "Caso sensible — solo socios asignados.", tags: ["confidencial"] },
    { title: "Apelación ante TSA", matterType: "administrative", status: "open", billingMode: "hourly" },
    { title: "Reestructuración accionaria", matterType: "corporate", status: "open", billingMode: "flat_fee", flatFeeAmount: "180000.00" },
    { title: "Saneamiento de título", matterType: "real_estate", status: "open", billingMode: "hourly" },
    { title: "Litigio comercial por incumplimiento", matterType: "civil", status: "open", billingMode: "contingency", counterpartyName: "Importadora del Sol, S.A." },
    { title: "Asesoría tributaria 2026", matterType: "tax", status: "open", billingMode: "retainer" },
    { title: "Auditoría de contratos", matterType: "corporate", status: "closed", billingMode: "flat_fee", flatFeeAmount: "45000.00" },
    { title: "Notificación de desahucio", matterType: "real_estate", status: "open", billingMode: "flat_fee", flatFeeAmount: "25000.00" },
  ];

  const CASES_B: CaseSeed[] = [
    { title: "Due diligence adquisición banco", matterType: "corporate", status: "open", billingMode: "hourly", visibility: "restricted", description: "M&A confidencial — equipo restringido.", tags: ["confidencial", "M&A"] },
    { title: "Compraventa terreno Cap Cana", matterType: "real_estate", status: "open", billingMode: "flat_fee", flatFeeAmount: "200000.00" },
    { title: "Conflicto de marcas", matterType: "civil", status: "open", billingMode: "hourly", counterpartyName: "Marcas Globales, S.A." },
    { title: "Recurso de reconsideración DGII", matterType: "tax", status: "open", billingMode: "hourly" },
    { title: "Defensa laboral por despido", matterType: "labor", status: "closed", billingMode: "flat_fee", flatFeeAmount: "55000.00" },
    { title: "Constitución de fideicomiso", matterType: "corporate", status: "open", billingMode: "flat_fee", flatFeeAmount: "150000.00" },
    { title: "Recurso de amparo", matterType: "administrative", status: "open", billingMode: "hourly" },
    { title: "Querella penal por fraude", matterType: "criminal", status: "on_hold", billingMode: "retainer" },
    { title: "Litigio sucesoral", matterType: "civil", status: "open", billingMode: "contingency" },
    { title: "Asesoría regulatoria energía", matterType: "administrative", status: "open", billingMode: "retainer" },
    { title: "Reclamación de garantía", matterType: "civil", status: "closed", billingMode: "hourly" },
    { title: "Acuerdo accionistas", matterType: "corporate", status: "open", billingMode: "flat_fee", flatFeeAmount: "85000.00" },
    { title: "Demanda por daños y perjuicios", matterType: "civil", status: "open", billingMode: "contingency", counterpartyName: "Constructora Norte, S.R.L." },
  ];

  // Helper to insert cases respecting the case_counters atomic sequence.
  // Since we're using admin connection (RLS bypassed), we still need
  // case_counters to track the per-(firm, year, matter) counter so live
  // generation matches expectations after seeding.
  const PREFIX: Record<CaseSeed["matterType"], string> = {
    civil: "CIV",
    corporate: "COR",
    real_estate: "INM",
    criminal: "PEN",
    labor: "LAB",
    tax: "FIS",
    administrative: "ADM",
    other: "OTR",
  };

  async function seedCases(
    firmId: string,
    cs: CaseSeed[],
    clientIds: string[],
    members: Array<{ id: string; role: Role }>,
  ) {
    const partners = members.filter((m) => m.role === "partner" || m.role === "admin");
    const lawyers = members.filter((m) => m.role === "lawyer" || m.role === "partner");
    const counters = new Map<string, number>();
    const year = new Date().getUTCFullYear();

    for (const c of cs) {
      const key = `${c.matterType}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      const code = `${year}-${PREFIX[c.matterType]}-${pad3(next)}`;

      const lead = pickOne(lawyers);
      const clientId = pickOne(clientIds);

      const [created] = await adminDb
        .insert(cases)
        .values({
          firmId,
          code,
          title: c.title,
          clientId,
          matterType: c.matterType,
          description: c.description ?? null,
          status: c.status,
          leadLawyerId: lead.id,
          billingMode: c.billingMode,
          flatFeeAmount: c.flatFeeAmount ?? null,
          counterpartyName: c.counterpartyName ?? null,
          counterpartyTaxId: c.counterpartyTaxId ?? null,
          tags: c.tags ?? [],
          visibility: c.visibility ?? "firm",
          openedAt: new Date(year, Math.floor(Math.random() * 5), 1 + Math.floor(Math.random() * 27)),
          closedAt: c.status === "closed" ? new Date() : null,
        })
        .returning({ id: cases.id });
      if (!created) throw new Error("[seed] case insert returned no row");

      // Restricted cases: assign exactly the lead (a partner) so other
      // members of the firm cannot see the case. The cross-tenant test
      // depends on this shape.
      if (c.visibility === "restricted") {
        await adminDb.insert(caseAssignments).values({
          caseId: created.id,
          userId: pickOne(partners).id,
          roleInCase: "lead",
        });
      }
    }
    // Seed case_counters so future create operations resume from here.
    for (const [matter, last] of counters) {
      await adminDb.execute(sql`
        INSERT INTO "case_counters" ("firm_id", "year", "matter_type", "last_seq")
        VALUES (${firmId}, ${year}, ${matter}::matter_type, ${last})
      `);
    }
  }

  await seedCases(
    firmA.id,
    CASES_A,
    insertedClientsA.map((c) => c.id),
    userIdsA,
  );
  await seedCases(
    firmB.id,
    CASES_B,
    insertedClientsB.map((c) => c.id),
    userIdsB,
  );

  console.log("[seed] Creating Fase 1 data (time entries, tasks, events, expenses)...");
  const counts = {
    timeEntries: 0,
    tasks: 0,
    events: 0,
    expenses: 0,
  };

  // Helper: seed a few time entries / tasks / expenses per case, plus some
  // firm-wide events. Restricted cases get the same treatment so we can
  // verify visibility cascade in tests.
  async function seedPhase1ForFirm(
    firmId: string,
    members: Array<{ id: string; role: Role }>,
  ) {
    const casesRows = await adminDb
      .select({ id: cases.id, code: cases.code, title: cases.title, leadLawyerId: cases.leadLawyerId, visibility: cases.visibility })
      .from(cases)
      .where(sql`${cases.firmId} = ${firmId} AND ${cases.deletedAt} IS NULL`);

    const partners = members.filter((m) => m.role === "partner" || m.role === "admin");
    const lawyers = members.filter((m) => m.role === "lawyer" || m.role === "partner");
    const today = new Date();
    today.setUTCHours(9, 0, 0, 0);

    for (const cs of casesRows) {
      const author = cs.leadLawyerId ?? pickOne(lawyers).id;

      // 3 time entries per case spanning the last 14 days
      for (let i = 0; i < 3; i++) {
        const startedAt = new Date(today);
        startedAt.setUTCDate(today.getUTCDate() - (i * 3 + 1));
        startedAt.setUTCHours(9 + i * 2);
        const endedAt = new Date(startedAt.getTime() + (60 + i * 30) * 60 * 1000);
        const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
        await adminDb.insert(timeEntries).values({
          firmId,
          caseId: cs.id,
          userId: author,
          description: i === 0 ? "Reunión con cliente" : i === 1 ? "Redacción de escrito" : "Investigación",
          startedAt,
          endedAt,
          durationSeconds,
          billable: i !== 2,
          status: i === 2 ? "approved" : "draft",
          approvedById: i === 2 ? pickOne(partners).id : null,
          approvedAt: i === 2 ? new Date() : null,
        });
        counts.timeEntries++;
      }

      // 2 tasks per case
      const dueIn = new Date(today);
      dueIn.setUTCDate(today.getUTCDate() + 7);
      await adminDb.insert(tasks).values([
        {
          firmId,
          caseId: cs.id,
          title: `Revisar documentación de ${cs.code}`,
          description: "Validar contratos firmados y agregarlos al expediente.",
          assigneeId: author,
          dueAt: dueIn,
          priority: "med",
          status: "todo",
          createdBy: pickOne(partners).id,
        },
        {
          firmId,
          caseId: cs.id,
          title: `Llamar al cliente sobre ${cs.code}`,
          assigneeId: pickOne(lawyers).id,
          dueAt: null,
          priority: "low",
          status: "in_progress",
          createdBy: pickOne(partners).id,
        },
      ]);
      counts.tasks += 2;

      // 1 expense per case
      const incurredAt = new Date(today);
      incurredAt.setUTCDate(today.getUTCDate() - 5);
      await adminDb.insert(expenses).values({
        firmId,
        caseId: cs.id,
        userId: author,
        description: "Notarización de documentos",
        amount: "1500.00",
        currency: "DOP",
        incurredOn: incurredAt,
        billable: true,
        status: "draft",
      });
      counts.expenses++;
    }

    // Firm-wide tasks (no caseId) — admin reminders.
    const admin = members.find((m) => m.role === "admin");
    if (admin) {
      await adminDb.insert(tasks).values([
        {
          firmId,
          caseId: null,
          title: "Renovar membresía CARD",
          assigneeId: admin.id,
          priority: "high",
          status: "todo",
          createdBy: admin.id,
        },
        {
          firmId,
          caseId: null,
          title: "Reunión semanal del equipo",
          assigneeId: admin.id,
          priority: "med",
          status: "todo",
          createdBy: admin.id,
        },
      ]);
      counts.tasks += 2;
    }

    // 3 firm-wide events spanning the next two weeks (firm-attended)
    const memberIds = members.map((m) => m.id);
    const nextWeek = new Date(today);
    nextWeek.setUTCDate(today.getUTCDate() + 7);
    const inThreeDays = new Date(today);
    inThreeDays.setUTCDate(today.getUTCDate() + 3);
    const inTen = new Date(today);
    inTen.setUTCDate(today.getUTCDate() + 10);

    await adminDb.insert(events).values([
      {
        firmId,
        caseId: casesRows[0]?.id ?? null,
        title: `Audiencia ${casesRows[0]?.code ?? ""}`.trim(),
        description: "Audiencia preliminar.",
        location: "Palacio de Justicia, Santo Domingo",
        startAt: inThreeDays,
        endAt: new Date(inThreeDays.getTime() + 90 * 60 * 1000),
        allDay: false,
        attendees: [author2(memberIds)],
        reminderMinutes: 60,
        icalUid: `${crypto.randomUUID()}@ldp-legal-suite`,
        createdBy: admin?.id ?? null,
      },
      {
        firmId,
        caseId: null,
        title: "Reunión de socios",
        description: "Revisión mensual.",
        location: "Sala de juntas",
        startAt: nextWeek,
        endAt: new Date(nextWeek.getTime() + 60 * 60 * 1000),
        allDay: false,
        attendees: members.filter((m) => m.role === "partner" || m.role === "admin").map((m) => m.id),
        reminderMinutes: 30,
        icalUid: `${crypto.randomUUID()}@ldp-legal-suite`,
        createdBy: admin?.id ?? null,
      },
      {
        firmId,
        caseId: casesRows[1]?.id ?? null,
        title: `Vencimiento ${casesRows[1]?.code ?? ""}`.trim(),
        description: "Plazo procesal — radicar respuesta.",
        location: "—",
        startAt: inTen,
        endAt: new Date(inTen.getTime() + 30 * 60 * 1000),
        allDay: true,
        attendees: memberIds,
        reminderMinutes: 1440,
        icalUid: `${crypto.randomUUID()}@ldp-legal-suite`,
        createdBy: admin?.id ?? null,
      },
    ]);
    counts.events += 3;
  }

  function author2(arr: string[]): string {
    const first = arr[0];
    if (!first) throw new Error("seedPhase1ForFirm: no members");
    return first;
  }

  await seedPhase1ForFirm(firmA.id, userIdsA);
  await seedPhase1ForFirm(firmB.id, userIdsB);

  console.log(`[seed] Done.
  Firms:        2
  Users:        ${userIdsA.length + userIdsB.length} (password for all seed users: ${SEED_PASSWORD})
  Clientes:     ${insertedClientsA.length + insertedClientsB.length}
  Casos:        ${CASES_A.length + CASES_B.length}
  Restringidos: 2 (uno por firma)
  Tiempos:      ${counts.timeEntries}
  Tareas:       ${counts.tasks}
  Eventos:      ${counts.events}
  Gastos:       ${counts.expenses}

  Try logging in as:
    carmen.almonte@almontereyes.do (admin / Bufete Almonte & Reyes)
    francisco.pichardo@pichardolegal.do (admin / Pichardo Legal Group)
`);
}

main()
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await adminPool.end();
  });
