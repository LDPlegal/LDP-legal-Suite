// scripts/seed-test-cases.ts
//
// Inserta casos de prueba CON OCR YA POBLADO para probar el chat IA,
// la generación de documentos, eventos por NLP y la herramienta
// read_document — los 4 escenarios que Gabriel describe en la spec.
//
// USO:
//   pnpm tsx --env-file=.env scripts/seed-test-cases.ts <email>
//
//   Por ejemplo:
//   pnpm tsx --env-file=.env scripts/seed-test-cases.ts gendrick@ldplegal.com.do
//
// El script:
//   - Resuelve firm_id y user_id desde el email.
//   - Crea (idempotente) 3 clientes ficticios.
//   - Crea (idempotente) 3 casos: asamblea societaria, demanda de desalojo,
//     compraventa de inmueble.
//   - Agrega documentos con OCR pre-poblado a cada caso (para que la IA
//     pueda leerlos con read_document).
//   - Agrega 1-2 eventos previos y notas a cada caso.
//
// Idempotente: si el caso con el mismo `code` ya existe, lo deja como está
// y solo asegura los documentos que falten. Podés correrlo varias veces.

import { config } from "dotenv";
config({ path: ".env" });

import { eq, and, sql } from "drizzle-orm";
import { adminDb, adminPool } from "../lib/db/admin";
import {
  cases,
  clients,
  documents,
  events,
  notes,
  timeEntries,
  users,
} from "../lib/db/schema";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`[seed-test-cases] ${msg}`);
    process.exit(1);
  }
}

async function main() {
  const email = process.argv[2];
  assert(email, "Usá: pnpm tsx --env-file=.env scripts/seed-test-cases.ts <email>");

  console.log(`[seed-test-cases] Resolviendo usuario ${email}...`);
  const [u] = await adminDb
    .select({ id: users.id, firmId: users.firmId, name: users.name })
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);
  assert(u, `No encontré usuario con email ${email}.`);
  console.log(`[seed-test-cases] OK — userId=${u.id} firmId=${u.firmId}`);

  // ---------------------------------------------------------------------------
  // CLIENTES
  // ---------------------------------------------------------------------------

  const clientesData = [
    {
      // Constructora Caribe SRL — el ejemplo recurrente de Gabriel.
      displayName: "Constructora Caribe SRL",
      legalName: "Constructora Caribe, S.R.L.",
      type: "corporate" as const,
      taxIdType: "rnc" as const,
      taxId: "131234567",
      email: "contacto@constructoracaribe.do",
      phone: "+1 809 555 0101",
      address: "Av. Winston Churchill #45, Piantini, Santo Domingo",
      primaryContactName: "Lic. Rosa Marte (Gerente)",
    },
    {
      // Persona física — inquilino moroso del caso de desalojo.
      displayName: "García Pérez, Juan Manuel",
      legalName: null,
      type: "individual" as const,
      taxIdType: "cedula" as const,
      taxId: "001-1234567-8",
      email: "jmgarcia@example.com",
      phone: "+1 809 555 0202",
      address: "Calle Pasteur #18, Apto. 3-B, Gazcue, Santo Domingo",
      primaryContactName: null,
    },
    {
      // Inversionista español — el caso de compraventa de inmueble.
      displayName: "Martínez Sánchez, Carlos",
      legalName: null,
      type: "individual" as const,
      taxIdType: "passport" as const,
      taxId: "AAB123456",
      email: "cmartinez@invest.es",
      phone: "+34 612 555 333",
      address: "Calle de Velázquez 24, 28001 Madrid, España",
      primaryContactName: null,
    },
  ];

  const clientIds: Record<string, string> = {};
  for (const c of clientesData) {
    const [existing] = await adminDb
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.firmId, u.firmId), eq(clients.displayName, c.displayName)))
      .limit(1);
    if (existing) {
      console.log(`[clientes] ya existe: ${c.displayName}`);
      clientIds[c.displayName] = existing.id;
      continue;
    }
    const [created] = await adminDb
      .insert(clients)
      .values({
        firmId: u.firmId,
        type: c.type,
        displayName: c.displayName,
        legalName: c.legalName,
        taxIdType: c.taxIdType,
        taxId: c.taxId,
        primaryContactName: c.primaryContactName,
        email: c.email,
        phone: c.phone,
        address: c.address,
        billingAddress: c.address,
        createdBy: u.id,
      })
      .returning({ id: clients.id });
    if (!created) throw new Error(`No pude crear cliente ${c.displayName}`);
    console.log(`[clientes] creado: ${c.displayName}`);
    clientIds[c.displayName] = created.id;
  }

  // ---------------------------------------------------------------------------
  // CASOS
  // ---------------------------------------------------------------------------

  const casosData = [
    {
      code: "2026-CORP-001",
      title: "Asamblea Ordinaria Anual 2026 — Constructora Caribe SRL",
      matterType: "corporate" as const,
      clientName: "Constructora Caribe SRL",
      description:
        "Cliente recurrente desde 2024. Asamblea ordinaria anual con aprobación de estados financieros 2025 y ratificación del gerente actual.",
      counterpartyName: null,
      court: null,
      docs: [
        {
          name: "Estatutos sociales — Constructora Caribe SRL.pdf",
          ocrText: `ESTATUTOS SOCIALES DE CONSTRUCTORA CARIBE, S.R.L.

Acta No. 001 del 14 de febrero del año 2014.

Capítulo I — DENOMINACIÓN, OBJETO, DOMICILIO Y DURACIÓN

Artículo 1. La sociedad se denominará "Constructora Caribe, S.R.L.", quedando registrada bajo la matrícula del Registro Mercantil No. 56789-SD.

Artículo 2. Objeto social: la ejecución de obras de construcción civil, comercial e industrial; la compra, venta, arrendamiento, urbanización y administración de bienes inmuebles; y toda actividad relacionada que la asamblea apruebe.

Artículo 3. El domicilio social se fija en Av. Winston Churchill #45, Piantini, Distrito Nacional.

Artículo 4. La duración será de noventa y nueve (99) años contados a partir del 14 de febrero de 2014.

Capítulo II — CAPITAL SOCIAL Y SOCIOS

Artículo 5. El capital social autorizado es de DIEZ MILLONES DE PESOS DOMINICANOS (RD$10,000,000.00) dividido en mil (1,000) cuotas sociales de DIEZ MIL PESOS (RD$10,000.00) cada una, todas suscritas y pagadas.

Artículo 6. La nómina de socios al momento de la constitución es:
- Marte de los Santos, Rosa Elena, dominicana, mayor de edad, cédula 001-0234567-1, titular de seiscientas (600) cuotas sociales — sesenta por ciento (60%).
- Pérez Jiménez, Luis Alberto, dominicano, mayor de edad, cédula 001-0345678-2, titular de trescientas (300) cuotas sociales — treinta por ciento (30%).
- Mejía Reyes, Carmen Lucía, dominicana, mayor de edad, cédula 001-0456789-3, titular de cien (100) cuotas sociales — diez por ciento (10%).

Capítulo III — GERENCIA

Artículo 12. La gerencia de la sociedad estará a cargo de un Gerente designado por la Asamblea de Socios. El Gerente tendrá la representación legal plena de la sociedad y todas las facultades de administración no reservadas a la Asamblea.

Artículo 13. El primer Gerente designado es Marte de los Santos, Rosa Elena, ya identificada, por un período de dos (2) años contados desde la fecha de constitución.`,
        },
        {
          name: "Acta Asamblea Ordinaria 2025 — ratificación gerente.pdf",
          ocrText: `ACTA DE ASAMBLEA ORDINARIA ANUAL
CONSTRUCTORA CARIBE, S.R.L.
RNC 131234567

En la ciudad de Santo Domingo, Distrito Nacional, a los doce (12) días del mes de marzo del año dos mil veinticinco (2025), siendo las diez (10:00) horas de la mañana, se reunieron los socios de Constructora Caribe, S.R.L. en su domicilio social, conforme convocatoria del Gerente.

NÓMINA DE SOCIOS PRESENTES O REPRESENTADOS:
- Rosa Elena Marte de los Santos — 600 cuotas (60%) — presente.
- Luis Alberto Pérez Jiménez — 300 cuotas (30%) — presente.
- Carmen Lucía Mejía Reyes — 100 cuotas (10%) — representada por poder otorgado al Lic. Gabriel Peralta Rizik de LDP Legal Advisors.

QUÓRUM: cien por ciento (100%) del capital social. Por unanimidad declarada válida la asamblea.

MESA DIRECTIVA:
- Presidente: Rosa Elena Marte de los Santos.
- Secretario: Luis Alberto Pérez Jiménez.

ORDEN DEL DÍA:
PRIMERO: conocimiento y aprobación de los estados financieros del ejercicio 2024.
SEGUNDO: ratificación del Gerente.
TERCERO: autorización a los abogados de la sociedad para la legalización de la presente acta.

RESOLUCIONES:
PRIMERA — Por unanimidad se aprueban los estados financieros del ejercicio 2024 presentados por el Gerente.
SEGUNDA — Por unanimidad se ratifica a la señora Rosa Elena Marte de los Santos como Gerente por un nuevo período de dos (2) años.
TERCERA — Por unanimidad se autoriza a los abogados de la oficina LDP Legal Advisors, indistintamente, para realizar todas las actuaciones necesarias para la legalización, registro y publicación del presente acto.

No habiendo más asuntos que tratar, se levanta la sesión a las once (11:00) horas de la mañana.

(firmas)
Rosa Elena Marte de los Santos                Luis Alberto Pérez Jiménez
Presidente                                       Secretario`,
        },
      ],
      eventTitle: "Asamblea Ordinaria Anual 2026",
      eventDaysFromNow: 45,
    },
    {
      code: "2026-CIV-014",
      title: "Demanda en Desalojo — García Pérez por falta de pago",
      matterType: "real_estate" as const,
      clientName: "Constructora Caribe SRL", // arrendador
      description:
        "Arrendador: Constructora Caribe SRL. Arrendatario: Juan Manuel García Pérez. Mora de cuatro (4) meses por canon de RD$45,000/mes. Intimación previa realizada. Procede demanda en desalojo bajo Ley 85-25.",
      counterpartyName: "Juan Manuel García Pérez",
      court: "Juzgado de Paz de la Primera Circunscripción del Distrito Nacional",
      docs: [
        {
          name: "Contrato de alquiler firmado.pdf",
          ocrText: `CONTRATO DE ALQUILER

ENTRE:
EL ARRENDADOR: Constructora Caribe, S.R.L., RNC 131234567, domiciliada en Av. Winston Churchill #45, Piantini, representada por su Gerente Rosa Elena Marte de los Santos.

EL ARRENDATARIO: Juan Manuel García Pérez, dominicano, mayor de edad, soltero, cédula 001-1234567-8, domiciliado en Calle Pasteur #18, Apto. 3-B, Gazcue.

OBJETO: El arrendador da en alquiler al arrendatario el apartamento No. 3-B del edificio ubicado en Calle Pasteur #18, Gazcue, Santo Domingo.

CANON MENSUAL: CUARENTA Y CINCO MIL PESOS DOMINICANOS CON 00/100 (RD$45,000.00), pagaderos los primeros cinco (5) días de cada mes.

PLAZO: Un (1) año contado desde el primero (1°) de enero de dos mil veinticinco (2025), prorrogable.

CLÁUSULA SÉPTIMA — FALTA DE PAGO: La falta de pago de dos (2) o más cánones consecutivos faculta al arrendador a demandar el desalojo inmediato sin necesidad de intimación previa, conforme a la Ley 85-25.

Firmado en Santo Domingo, a los quince (15) días del mes de diciembre del año 2024.

(firmas)`,
        },
        {
          name: "Acto de intimación de pago.pdf",
          ocrText: `ACTO DE INTIMACIÓN DE PAGO No. 234/2026

En la ciudad de Santo Domingo, a los veinte (20) días del mes de febrero del año dos mil veintiseis (2026), por requerimiento de Constructora Caribe S.R.L., yo, JUAN PÉREZ, alguacil ordinario de la Cámara Civil y Comercial de la Corte de Apelación del Distrito Nacional, me he trasladado al domicilio del señor JUAN MANUEL GARCÍA PÉREZ ubicado en Calle Pasteur #18, Apto. 3-B, Gazcue, donde le hice INTIMACIÓN FORMAL para que en el plazo de tres (3) días francos pague los cánones vencidos correspondientes a los meses de NOVIEMBRE 2025, DICIEMBRE 2025, ENERO 2026 y FEBRERO 2026, por un total de CIENTO OCHENTA MIL PESOS DOMINICANOS (RD$180,000.00), bajo apercibimiento de demanda en desalojo.

Recibido por: Juan Manuel García Pérez (firmó).`,
        },
      ],
      eventTitle: "Audiencia conciliación — Demanda en desalojo",
      eventDaysFromNow: 21,
    },
    {
      code: "2026-INM-008",
      title: "Compraventa apartamento Punta Cana — Martínez Sánchez",
      matterType: "real_estate" as const,
      clientName: "Martínez Sánchez, Carlos",
      description:
        "Cliente nuevo, inversionista español. Compra de apartamento en residencial Cocotal, Punta Cana. Precio US$485,000, 30% inicial, balance al cierre en 60 días.",
      counterpartyName: "Desarrolladora Cocotal Bavaro SRL",
      court: null,
      docs: [
        {
          name: "Oferta de compra firmada.pdf",
          ocrText: `OFERTA DE COMPRA DE INMUEBLE

EL OFERENTE: Carlos Martínez Sánchez, español, mayor de edad, casado, portador del pasaporte de la República de España No. AAB123456, domiciliado en Calle de Velázquez 24, 28001 Madrid, España.

EL PROPIETARIO: Desarrolladora Cocotal Bavaro, S.R.L., RNC 130987654, representada por su Presidente Manuel Rosario Vargas, dominicano, cédula 028-0098765-1.

INMUEBLE OFERTADO:
- Apartamento No. 4-2 del Edificio "Coral Tower" del residencial Cocotal Golf & Country Club.
- Parcela No. 245-A del Distrito Catastral No. 11/3 del municipio Punta Cana, provincia La Altagracia.
- Certificado de Título No. 2018-0034567 expedido por el Registrador de Títulos de Higüey.
- Área de construcción: ciento setenta y ocho metros cuadrados (178.00 m²).
- Linderos: al Norte con jardines comunes; al Sur con Avenida Cocotal; al Este con Edificio Palmera; al Oeste con piscina común.

PRECIO OFERTADO: CUATROCIENTOS OCHENTA Y CINCO MIL DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA (US$485,000.00).

FORMA DE PAGO PROPUESTA:
- Treinta por ciento (30%) — US$145,500.00 — al firmar la promesa de compraventa.
- Setenta por ciento (70%) — US$339,500.00 — al cierre, contra entrega del Certificado de Título a nombre del comprador, en plazo no mayor de sesenta (60) días.

FECHA DE LA OFERTA: 20 de abril de 2026.

(firmas)`,
        },
        {
          name: "Pasaporte Carlos Martinez (escaneo).pdf",
          ocrText: `REINO DE ESPAÑA — PASAPORTE

Tipo: P
Código: ESP
Número: AAB123456

Apellidos: MARTÍNEZ SÁNCHEZ
Nombre: CARLOS
Nacionalidad: ESPAÑOLA / SPANISH
Fecha de nacimiento: 14 06 1978
Sexo: M
Lugar de nacimiento: MADRID
Fecha de expedición: 03 11 2021
Fecha de caducidad: 03 11 2031
Autoridad: COMISARÍA / MADRID

(Datos biométricos y firma del titular en la imagen original.)`,
        },
        {
          name: "Certificado de Título 2018-0034567.pdf",
          ocrText: `JURISDICCIÓN INMOBILIARIA
REPÚBLICA DOMINICANA
CERTIFICADO DE TÍTULO

Número: 2018-0034567
Fecha de expedición: 22 de agosto de 2018

Designación Catastral:
- Parcela No. 245-A del Distrito Catastral No. 11/3
- Municipio: Punta Cana
- Provincia: La Altagracia
- Superficie: 178.00 m²

Propietario: DESARROLLADORA COCOTAL BAVARO, S.R.L., RNC 130987654.

Descripción: Apartamento No. 4-2 del Edificio "Coral Tower" del residencial Cocotal Golf & Country Club.

CARGAS Y GRAVÁMENES VIGENTES:
- (NINGUNA al momento de la expedición de este certificado.)

Registrador de Títulos de Higüey
Lic. Pedro Antonio Almonte Reyes`,
        },
      ],
      eventTitle: "Firma promesa de compraventa — oficina LDP",
      eventDaysFromNow: 7,
    },
  ];

  for (const cs of casosData) {
    const clientId = clientIds[cs.clientName];
    assert(clientId, `Falta cliente ${cs.clientName}`);

    let caseId: string;
    const [existingCase] = await adminDb
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.firmId, u.firmId), eq(cases.code, cs.code)))
      .limit(1);
    if (existingCase) {
      console.log(`[casos] ya existe: ${cs.code} (saltando)`);
      caseId = existingCase.id;
    } else {
      const [created] = await adminDb
        .insert(cases)
        .values({
          firmId: u.firmId,
          code: cs.code,
          title: cs.title,
          clientId,
          matterType: cs.matterType,
          description: cs.description,
          status: "open",
          billingMode: "hourly",
          leadLawyerId: u.id,
          counterpartyName: cs.counterpartyName,
          court: cs.court,
        })
        .returning({ id: cases.id });
      if (!created) throw new Error(`No pude crear caso ${cs.code}`);
      caseId = created.id;
      console.log(`[casos] creado: ${cs.code} — ${cs.title}`);
    }

    // Documentos con OCR pre-poblado.
    for (const d of cs.docs) {
      const [exists] = await adminDb
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.firmId, u.firmId), eq(documents.caseId, caseId), eq(documents.name, d.name)))
        .limit(1);
      if (exists) {
        console.log(`  [docs] ya existe: ${d.name}`);
        continue;
      }
      await adminDb.insert(documents).values({
        firmId: u.firmId,
        caseId,
        name: d.name,
        mimeType: "application/pdf",
        sizeBytes: Math.max(50_000, d.ocrText.length * 4),
        storageKey: `seed/${u.firmId}/${caseId}/${d.name.replace(/[^a-z0-9._-]/gi, "_")}`,
        uploadedBy: u.id,
        ocrText: d.ocrText,
        ocrStatus: "done",
        sharedWithClient: false,
      });
      console.log(`  [docs] creado: ${d.name}`);
    }

    // Evento futuro de muestra.
    const [evExists] = await adminDb
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.firmId, u.firmId), eq(events.caseId, caseId), eq(events.title, cs.eventTitle)))
      .limit(1);
    if (!evExists) {
      const start = new Date();
      start.setDate(start.getDate() + cs.eventDaysFromNow);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 90 * 60_000);
      await adminDb.insert(events).values({
        firmId: u.firmId,
        caseId,
        title: cs.eventTitle,
        description: `Evento de prueba sembrado por el script de seed.`,
        startAt: start,
        endAt: end,
        allDay: false,
        icalUid: `seed-${caseId}-${cs.eventTitle.replace(/\s/g, "")}@ldp-legal-suite`,
        eventType: cs.code.includes("CIV") ? "audiencia" : "reunion_cliente",
        createdBy: u.id,
      });
      console.log(`  [eventos] creado: ${cs.eventTitle} en ${cs.eventDaysFromNow} días`);
    }

    // Nota interna corta para que la IA tenga texto contextual extra.
    const noteContent = `Caso sembrado por seed script. Fecha de apertura: ${new Date().toISOString().slice(0, 10)}. Probar generación de documentos y NLP de eventos desde el chat IA.`;
    const [noteExists] = await adminDb
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.firmId, u.firmId), eq(notes.caseId, caseId)))
      .limit(1);
    if (!noteExists) {
      await adminDb.insert(notes).values({
        firmId: u.firmId,
        caseId,
        title: "Nota de apertura",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: noteContent }] }] },
        authorId: u.id,
      });
      console.log(`  [notas] creada`);
    }

    // 1 entrada de tiempo para que stats no salgan en cero.
    const [teExists] = await adminDb
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.firmId, u.firmId), eq(timeEntries.caseId, caseId)))
      .limit(1);
    if (!teExists) {
      await adminDb.insert(timeEntries).values({
        firmId: u.firmId,
        caseId,
        userId: u.id,
        description: "Apertura de expediente, revisión de documentos.",
        startedAt: new Date(Date.now() - 2 * 60 * 60_000),
        endedAt: new Date(Date.now() - 1 * 60 * 60_000),
        durationSeconds: 60 * 60,
        billable: true,
      });
      console.log(`  [tiempos] creada: 1h`);
    }
  }

  console.log(`\n[seed-test-cases] ✓ listo. Andá a /casos en la app — vas a ver 3 expedientes nuevos.`);
  console.log(`[seed-test-cases] Cosas para probar:`);
  console.log(`  1. Cmd+J en 2026-CORP-001 → "Generame el acta de asamblea ordinaria 2026 con aprobación de estados financieros y ratificación de la gerente." (la IA debería leer los estatutos con read_document y armar el acta)`);
  console.log(`  2. Cmd+J en 2026-CIV-014 → "Redactá la demanda en desalojo bajo Ley 85-25." (debería leer el contrato y la intimación, calcular los meses de mora)`);
  console.log(`  3. Cmd+J en 2026-INM-008 → "Prepará el contrato de promesa de venta. 30% inicial, balance al cierre en 60 días." (debería sacar la designación catastral del certificado de título)`);
  console.log(`  4. En cualquiera: "Agendá una audiencia el viernes a las 9am en el Juzgado de Paz" — debería crear el evento.`);

  await adminPool.end();
}

main().catch(async (err) => {
  console.error(err);
  await adminPool.end();
  process.exit(1);
});
