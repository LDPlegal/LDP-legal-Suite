# DECISIONS.md — LDP Legal Suite, Fase 0

Decisiones arquitectónicas y excepciones documentadas. Sigue el formato del
BRIEF (§ Paso 11). Para alcance, modelo de datos completo y fases siguientes,
ver [`prompt-claude-code-ldp-legal-suite_final.md`](./prompt-claude-code-ldp-legal-suite_final.md)
en Desktop del usuario.

---

## 9.1 — Multi-tenant: RLS de Postgres + helper aplicativo (defensa en profundidad)

**Decisión:** Habilitar Row Level Security en todas las tablas con `firm_id`
desde la primera migración. Adicionalmente, mantener el helper aplicativo
`withFirm(firmId, userId, fn)` por el que pasan TODAS las queries de dominio.
El usuario de Postgres de runtime es `app_user` con `BYPASSRLS = false`.

**Implementación en este repo:**

- Roles + grants: [`scripts/migrate.ts`](./scripts/migrate.ts) crea `app_user`
  (NOBYPASSRLS), valida `rolbypassrls = false` antes de continuar (BRIEF
  Trampa #1), y otorga privilegios mínimos (`SELECT/INSERT/UPDATE/DELETE`).
- Migración inicial: [`drizzle/migrations/0000_initial_with_rls.sql`](./drizzle/migrations/0000_initial_with_rls.sql)
  — schema y `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING ... WITH CHECK`
  van en el MISMO archivo (no separados, BRIEF § Paso 4).
- Helper: [`lib/db/with-firm.ts`](./lib/db/with-firm.ts) ejecuta
  `set_config('app.firm_id', $1, true)` y `app.user_id` dentro de una
  transacción y pasa `tx` al callback. Usar `db` directo dentro del
  callback rompe el aislamiento — el código de queries
  ([`lib/db/queries/*.ts`](./lib/db/queries/)) usa `tx` siempre.
- Conexiones: dos pools distintos —
  [`lib/db/client.ts`](./lib/db/client.ts) (runtime, `app_user`) y
  [`lib/db/admin.ts`](./lib/db/admin.ts) (admin, solo migrate/seed/auth).

**Por qué así y no de otra manera:** Una sola query que omita `withFirm`
filtraría datos entre firmas. RLS contiene ese error a nivel de motor —
es un costo único de setup contra una clase entera de bugs en software
legal. La doble capa (RLS + helper) es defensa en profundidad: si un
desarrollador olvida el helper, RLS falla la query (no la silencia).

**Pendientes / a revisar:**

- Trampa #4 (BRIEF): la policy de `cases` con la subquery a `case_assignments`
  + `users` para resolver visibility puede degradarse a escala (cientos de
  miles de casos). No se premature-optimiza con índices funcionales en Fase 0;
  revisar plan de query con `EXPLAIN ANALYZE` cuando un firm seedeado real
  exceda ~10k casos.
- Si en algún momento se quiere multi-firm-per-user (un usuario en dos
  firmas distintas), revisar el constraint compuesto `(firm_id, email)` y
  agregar selección de firma en el login (ver § Excepción E1).

---

## 9.2 — Autorización a nivel de caso (`case_assignments` + `cases.visibility`)

**Decisión:** Roles globales (`admin`, `partner`, `lawyer`, `paralegal`,
`client`) controlan capacidades transversales. La visibilidad de un caso
individual se controla por `case_assignments` cuando `case.visibility = 'restricted'`.

**Implementación en este repo:**

- Tablas: [`cases.visibility`](./lib/db/schema.ts) con default `'firm'`;
  tabla `case_assignments` con índice único `(case_id, user_id)`.
- Policy de RLS sobre `cases` codifica las tres ramas: visibility = 'firm',
  membresía en `case_assignments`, o `users.role = 'admin'` para el firm
  del caso. Ver bloque "cases_firm_visibility" en
  [`drizzle/migrations/0000_initial_with_rls.sql`](./drizzle/migrations/0000_initial_with_rls.sql).
- UI: el toggle "Caso restringido" del drawer de creación
  ([`app/(app)/casos/_components/caso-form-drawer.tsx`](./app/(app)/casos/_components/caso-form-drawer.tsx))
  muestra el editor de asignaciones cuando se activa; el schema Zod
  ([`lib/schemas/caso.ts`](./lib/schemas/caso.ts)) valida que un caso
  restringido tenga al menos un `lead`.
- Tests: el seed crea un caso restringido por firma; el test de RLS
  ([`tests/integration/rls.test.ts`](./tests/integration/rls.test.ts))
  verifica las tres ramas (lawyer no asignado → no ve, admin → sí ve,
  caso 'firm' → todos ven). E2E equivalente en
  [`tests/e2e/cross-tenant.spec.ts`](./tests/e2e/cross-tenant.spec.ts).

**Por qué así y no de otra manera:** Murallas chinas, conflictos entre
socios, casos sensibles. Modelarlo desde Fase 0 cuesta una columna y una
tabla; agregarlo en Fase 2 es un refactor de autorización entera (afecta
`time_entries`, `tasks`, `events`, `documents`, `notes`, `expenses`,
`invoices` que en futuras fases heredan visibilidad vía join con cases).

**Pendientes / a revisar:**

- Cuando se introduzcan `time_entries`, `tasks`, etc. (Fase 1+), sus
  policies de RLS deben hacer `JOIN cases` y heredar la visibilidad. Hay
  que validarlo con un test cross-tenant equivalente para cada nueva tabla.

---

## 9.3 — Estrategia fiscal RD: NCF/e-CF con doble modo

**Decisión:** El sistema soportará dos modos de facturación configurables por
firm: **interno/proforma** (default) y **fiscal** con NCF/e-CF. En Fase 0 NO
se implementa facturación; en Fase 2 se construye respetando la decisión.

**Implementación en este repo:**

- Fase 0 NO crea tablas `invoices`, `invoice_items`, `payments`. El
  schema ([`lib/db/schema.ts`](./lib/db/schema.ts)) las posterga.
- Constancia: el sidebar tiene "Facturación" como link disabled apuntando
  a una página `ComingSoon` con texto "Fase 2".
- Las constantes de impuestos (ITBIS 18%, retención ISR 10%, retención
  ITBIS 30% para servicios profesionales a personas jurídicas) se modelarán
  en `firms.settings` (jsonb) o en una tabla `tax_settings` cuando
  Facturación llegue.

**Por qué así y no de otra manera:** Facturación electrónica obligatoria en
RD. No modelar NCF desde el inicio significa rehacer Facturación entera. El
doble modo permite que firmas sin facturación electrónica configurada usen
el sistema sin trabarse.

**Pendientes / a revisar:**

- Antes de Fase 2, decidir si la integración con DGII se hace directa o vía
  proveedor externo. La interfaz `EInvoiceProvider` debe abstraer el detalle.
- Confirmar qué tipos de NCF/e-CF (B01, B02, E31, E32) son los que LDP
  necesita realmente — el documento maestro asume los cuatro pero podría
  haber otros.

---

## 9.4 — Timer server-side con `active_timers` + heartbeat

**Decisión:** El timer activo vive en una tabla `active_timers` (un registro
máximo por usuario, PK `user_id`). El cliente envía heartbeat cada 30s. Nunca
se usa localStorage para el timer.

**Implementación en este repo:**

- Fase 0 NO crea la tabla `active_timers`. El schema la posterga a Fase 1.
- Verificación: `grep -rn "localStorage" app/ components/ lib/` no devuelve
  nada relacionado con timer (preferencias UI menores como columnas
  configurables sí pueden usarlo, pero NO el timer).
- El sidebar muestra "Sin timer activo · El timer llega en Fase 1" como
  recordatorio visible (no es un placeholder funcional, es texto explícito).

**Por qué así y no de otra manera:** localStorage duplica horas si el
usuario abre dos tabs y se pierde si limpia el navegador. Un sistema de
billing legal que pierde horas o duplica es un sistema que pierde clientes.

**Pendientes / a revisar:**

- Implementar `active_timers` + heartbeat en Fase 1 con cleanup de timers
  con `last_heartbeat_at` > 15min vía pg-boss o similar.

---

## 9.5 — Zona horaria: UTC en DB, tz del firm en presentación

**Decisión:** Todos los timestamps en DB tipo `timestamptz` (UTC). Cada
firm tiene `timezone` (default `America/Santo_Domingo`). La conversión
ocurre en la capa de presentación.

**Implementación en este repo:**

- Schema: TODAS las columnas timestamp son `timestamp with time zone` (ver
  [`lib/db/schema.ts`](./lib/db/schema.ts)).
- `firms.timezone`: string IANA, default `America/Santo_Domingo`.
- Helper: [`lib/datetime/format.ts`](./lib/datetime/format.ts) expone
  `formatInFirmTz(date, timezone, pattern)` y `formatDateOnly`. Usa
  `date-fns-tz` con locale `es`.
- Render: `app/(app)/casos/page.tsx` y `app/(app)/casos/[id]/page.tsx` ya
  usan `formatInFirmTz` para `openedAt`/`closedAt`.

**Por qué así y no de otra manera:** Sin esta decisión clavada, el primer
reporte de "audiencia mañana 9am" que aparezca a las 5am o 1pm es inevitable.

**Pendientes / a revisar:**

- Cuando se implementen Eventos (Fase 1) con export `.ics`, asegurar que
  `TZID` sea correcto. Test específico para esto.
- El timezone del firm es por ahora un campo de DB sin UI para editarlo —
  Configuración (Fase 1+) lo expondrá.

---

## 9.6 — Conflict check: modelo soportado, ejecución en Fase 4

**Decisión:** Conflict check automático (alerta cuando la contraparte fue
cliente del firm o trabajó con un abogado del firm) se difiere a Fase 4.
Pero el modelo de datos lo soporta desde Fase 0.

**Implementación en este repo:**

- Columnas: `cases.counterparty_name` (text) y `cases.counterparty_tax_id`
  (text nullable, con índice compuesto `(firm_id, counterparty_tax_id)`).
- UI: el drawer de creación de caso captura `counterparty_name` y
  `counterparty_tax_id` desde Fase 0 — los datos ya quedan estructurados.
- Form Zod ([`lib/schemas/caso.ts`](./lib/schemas/caso.ts)) los valida
  como opcionales pero estructurados.

**Por qué así y no de otra manera:** Capturar `counterparty` como string
libre desde el inicio sin tax_id estructurado significa migrar y limpiar
datos sucios cuando llegue Fase 4. Capturarlo bien desde Fase 0 cuesta
una columna extra.

**Pendientes / a revisar:**

- En Fase 4, el algoritmo de conflict check comparará `counterparty_tax_id`
  contra `clients.tax_id` (mismo firm) y contra el historial de
  `case_assignments` cruzado con casos donde el abogado fue parte. Definir
  reglas exactas en ese momento.

---

## 9.7 — OCR: decisión binaria, no placeholder

**Decisión:** OCR no se incluye en Fase 0 ni Fase 1. En Fase 2 (Documentos)
se integra OCR real vía Tesseract local (en imagen Docker) con interfaz
abstracta `OCRProvider` que permite cambiar a AWS Textract o Google
Document AI.

**Implementación en este repo:**

- Fase 0 NO crea tabla `documents` ni función de OCR. La página
  `/documentos` muestra `ComingSoon` con texto "Fase 2".
- No existe ninguna función `extractTextFromPdf`, `runOCR`, etc. en `lib/`.
  Verificable con `grep -ri "ocr\|tesseract" lib/ app/`.

**Por qué así y no de otra manera:** Un placeholder de OCR que no hace
nada termina en producción y los usuarios no se dan cuenta hasta que
buscan "demanda 2024" en un PDF escaneado y no encuentran nada.

**Pendientes / a revisar:**

- Fase 2: implementar worker en background con `pg-boss`, interfaz
  `OCRProvider`, llenado async de `documents.ocr_text`, integración con
  el índice tsvector de búsqueda.

---

# Excepciones documentadas

Estas son desviaciones del documento maestro/BRIEF que se tomaron de
forma consciente durante la Fase 0. Cada una se justifica.

---

## E1 — Email globalmente único con índice único compuesto parcial

**Decisión:** En lugar de un `UNIQUE (email)` global, el schema tiene un
`UNIQUE (firm_id, email) WHERE deleted_at IS NULL` parcial. La unicidad
es por firma, no global. El soft-delete libera el email para reuso.

**Implementación:** [`users.users_firm_email_unique`](./lib/db/schema.ts)
en el schema; la migración SQL inicial lo crea.

**Por qué:** El BRIEF lo pide explícitamente ("unique por firm — usar
índice único compuesto, no UNIQUE solo en email"). Para Fase 0, los seeds
están curados sin colisiones de email entre firmas, así que el login por
email solo (sin selector de firma) funciona correctamente. Si en el futuro
se quiere multi-firm-per-email, hay que añadir selector de firma en el
login flow.

**Riesgo / mitigación:** Si dos firmas distintas registran un usuario con
el mismo email, el login con solo `(email, password)` no podrá distinguirlos.
Better-auth fallaría buscando `WHERE email = $1 LIMIT 1` (no determinista).
Mitigación: monitorear; cuando ocurra, agregar un dropdown "Firma" al login.

---

## E2 — Excepción de `withFirm` en signup (Trampa #6)

**Decisión:** `app/_actions/auth/signup.ts` NO usa `withFirm`. Inserta el
firm con la conexión admin (`adminDb`) y luego invoca
`auth.api.signUpEmail()` que también opera con la conexión admin.

**Por qué:** Cuando el primer admin de un firm se registra, el firm aún
no existe — `withFirm` no puede aplicar. Es la única excepción razonable.
El INSERT del firm + el INSERT del user son atómicos en el sentido de que
si el segundo falla, el primero se rollback explícitamente
(`adminDb.delete(firms).where(...)`).

**Riesgo / mitigación:** El rollback no es transaccional (son dos
conexiones distintas). Si el rollback falla, queda un firm huérfano.
Para Fase 0 con baja frecuencia de signup esto es aceptable; Fase 1 puede
mejorarlo con una transacción explícita que envuelva ambas operaciones.

---

## E3 — Better-auth usa la conexión admin (BYPASSRLS) para todas sus operaciones

**Decisión:** `auth = betterAuth({ database: drizzleAdapter(adminDb, ...) })`.
Better-auth lee/escribe `users`, `sessions`, `accounts`, `verifications`
con la conexión admin (que bypassa RLS).

**Por qué:** Durante signin/signup, better-auth no tiene contexto de
firma — debe leer la tabla `users` por email para encontrar al usuario
antes de saber a qué firma pertenece. RLS filtraría todo. Forzar
better-auth a operar con la conexión admin es la solución más limpia.

**Riesgo / mitigación:** Better-auth tiene acceso ilimitado a las tablas
auxiliares. Domain code NUNCA debe consultar `sessions`, `accounts`,
`verifications` directamente — solo via `auth.api.getSession()`. RLS sigue
ENABLE en esas tablas con policies que validan `users.firm_id` (defensa
en profundidad), por si código de dominio futuro hiciera la query
incorrecta vía `app_user`.

---

## E4 — Postgres nativo en Windows (no Docker) para desarrollo

**Decisión:** El usuario instala Postgres 16 nativamente en Windows
(`winget install PostgreSQL.PostgreSQL.16` o instalador EnterpriseDB).
[`docker-compose.yml`](./docker-compose.yml) se mantiene en el repo para
self-hosting eventual, pero NO se usa en dev local.

**Por qué:** El usuario no tenía Docker Desktop instalado y prefirió no
agregar esa dependencia para empezar. Postgres nativo es más liviano,
sin WSL2, y más fácil de inspeccionar con `psql` o pgAdmin. Para
producción / staging, `docker compose up -d` debe seguir funcionando con
el `.env` correcto.

**Riesgo / mitigación:** Versiones de Postgres entre dev (Windows 16.x)
y prod (Linux Docker 16-alpine) podrían diferir en patches menores. Para
Fase 0 esto es aceptable. El RLS test corre contra la misma DB local así
que las políticas son validadas con la misma versión que se usará.

---

## E5 — `eslint.config.mjs` usa flat config sin tipo `experimental`

**Decisión:** Al usar Next.js 15 + ESLint 9, el config toma la forma
flat (no `.eslintrc.json`). Eso es lo que `eslint-config-next` recomienda
para la versión 15+.

**Por qué:** Forward-compatible con ESLint 10. Sin warnings al correr
`pnpm lint`.

---

# Decisiones menores

(Pequeñas decisiones técnicas tomadas durante la implementación que no
ameritan secciones completas.)

- **Estilo shadcn:** `new-york`, base color `slate`, CSS variables.
  Definido en [`components.json`](./components.json). Cambiar a `default`
  más adelante es ~30 min de re-tematizar tokens.
- **Forms:** Server actions con FormData puro + Zod en server. No
  `react-hook-form` para Fase 0 — los forms son lo bastante simples y
  los errores se renderizan desde el state del action. `react-hook-form`
  está instalado por si se necesita en Fase 1+ con UX más rica.
- **TanStack Table:** instalado pero no usado en las tablas de Fase 0
  (uso `<Table>` semántica directa). En Fase 1 con filtros de columna
  por usuario y persistencia, conviene migrar a TanStack.
- **nuqs:** instalado y proveedor montado en [`app/layout.tsx`](./app/layout.tsx)
  pero los filtros de listas usan `searchParams` server-side puro en
  Fase 0 (no necesitan reactividad client-side). Cuando se agreguen
  filtros que cambian sin recargar, migrar a `useQueryState` de nuqs.
- **Fuentes:** Inter (UI) y JetBrains Mono (códigos, RNC, factura). Cargadas
  vía `next/font/google` en [`app/layout.tsx`](./app/layout.tsx).
- **Icon library:** `lucide-react` (decidido por el documento maestro).
- **Naming `users` plural vs `user` singular de better-auth:** Se mantiene
  `users` (plural) en español/inglés del dominio; better-auth se configura
  con `usePlural: true` para coincidir.

---

# Fase 1 — Tiempos · Tareas · Calendario · Gastos

Decisiones específicas tomadas durante la implementación de la Fase 1.
Todas se validan con tests (`tests/integration/fase1-rls.test.ts`).

## F1.1 — Visibilidad de tablas hijas hereda del caso

**Decisión:** Las policies de RLS de `time_entries`, `tasks` (con `case_id`),
`events` (con `case_id`) y `expenses` reutilizan el helper SECURITY DEFINER
`app_user_can_see_case(case_id, user_id, firm_id)` para heredar la
visibilidad del caso. Si un caso es `restricted` y el usuario no está en
`case_assignments` (ni es admin), también se ocultan sus tiempos, tareas,
eventos y gastos.

**Implementación:** [`drizzle/migrations/0002_phase1_with_rls.sql`](./drizzle/migrations/0002_phase1_with_rls.sql) —
policy "X_firm_case_visibility" en cada tabla. Funcion `app_user_can_see_case`
es SECURITY DEFINER STABLE con `SET search_path = public, pg_temp`.

**Por qué SECURITY DEFINER:** la lógica de visibilidad joinea `cases` +
`case_assignments` + `users`. Sin SECURITY DEFINER, esos joins disparan
las policies de esas tablas y caemos en recursión (mismo problema que
0001 en Fase 0). La función bypassea RLS internamente al ejecutarse como
owner.

**Pendientes:** revisar plan de query con `EXPLAIN ANALYZE` cuando un firm
exceda ~10k time_entries. La función se evalúa por fila durante el filtro;
agregar índices o materialized views si es lento.

## F1.2 — `tasks.case_id` y `events.case_id` son nullable

**Decisión:** Tareas y eventos pueden vivir fuera del contexto de un caso
(`case_id IS NULL` significa firm-wide). La policy maneja ambos: si
`case_id IS NULL`, basta con la coincidencia de `firm_id`; si tiene caso,
delega al helper de visibilidad.

**Por qué:** Hay tareas de admin/operación (renovar membresías, reuniones
internas) que no son de un caso específico. Forzar un caso obligaría a
crear casos ficticios.

## F1.3 — Timer es personal: solo el dueño lo ve

**Decisión:** Policy de `active_timers` filtra por `user_id`, no solo por
`firm_id`. Ni siquiera el admin del firm ve el timer activo de otro
usuario por la conexión runtime.

**Por qué:** Un timer es estado privado de la sesión del usuario.
Reportes (Fase 3) pueden agregarlo via SECURITY DEFINER si hace falta
visibilidad cruzada para facturación.

**Pendientes:** cuando se haga "supervisor view" en Fase 3, decidir si
el partner/admin debe ver timers activos del equipo en tiempo real.

## F1.4 — Timer server-side con upsert por user_id

**Decisión:** PK de `active_timers` es `user_id` solo. Iniciar un timer
mientras otro está activo lo REEMPLAZA atómicamente vía
`INSERT ... ON CONFLICT (user_id) DO UPDATE`. Nunca hay dos timers para
el mismo usuario, ni siquiera transitoriamente.

**Implementación:** [`lib/db/queries/timers.ts`](./lib/db/queries/timers.ts)
`startTimer()` usa `onConflictDoUpdate`. Test verifica no-duplicación
(`tests/integration/fase1-rls.test.ts`).

## F1.5 — Heartbeat 30s + stale > 15min

**Decisión:** Cliente envía POST a `/api/timer/heartbeat` cada 30s.
`isStale()` retorna true si `last_heartbeat_at < now() - 15min`. UI muestra
banner amarillo "inactivo >15min" con opción de descartar.

**Implementación:**
- [`app/api/timer/heartbeat/route.ts`](./app/api/timer/heartbeat/route.ts)
- [`components/layout/active-timer.tsx`](./components/layout/active-timer.tsx)
  — `setInterval(HEARTBEAT_MS = 30000)` mientras hay timer; polling adicional
  cada 60s al endpoint `/api/timer/active` para reflejar timers iniciados
  desde otra tab/dispositivo.

**Por qué 30s/15min:** literal del maestro § 9.4. La diferencia 30:1 es
margen suficiente para que un usuario con red intermitente no caiga en
"stale" cuando el timer realmente sigue activo.

## F1.6 — Detección de conflictos de eventos sin bloqueo

**Decisión:** Al crear un evento, si los `attendees` tienen otro evento
solapado en el rango `[startAt, endAt)`, mostramos warning con la lista
de conflictos. El usuario puede continuar marcando "Crear de todos modos"
(checkbox `skipConflict`).

**Implementación:** [`lib/db/queries/events.ts`](./lib/db/queries/events.ts)
`findConflictingEvents()` usa el operador `&&` (overlap) sobre el array
`attendees::uuid[]`. UI: el form re-submita con `skipConflict=true`.

**Por qué no bloqueante:** doble booking es a veces deseado (delegación,
asistente paralelo). El sistema avisa, pero no decide.

## F1.7 — Export `.ics` minimal sin librería externa

**Decisión:** `buildIcs()` en `lib/db/queries/expenses.ts` (compartido)
genera el `.ics` a mano siguiendo RFC 5545. No agregamos `ics` package
para evitar dep transitivas.

**Implementación:** [`app/api/calendario/export.ics/route.ts`](./app/api/calendario/export.ics/route.ts)
emite UTC con `Z` (sin TZID porque maestro § 9.5 ya define UTC en DB).

**Limitaciones aceptadas:**
- No soporta recurrencia (RRULE) — Fase 4 cuando llegue sincronización
  bidireccional iCal.
- No usa `VTIMEZONE` — clientes calendario interpretan los UTC `Z` y
  los muestran en su tz local. Suficiente para el uso bilateral.

## F1.8 — Diferidos a Fases siguientes

Documentar qué se posterga conscientemente para no reabrir la conversación:

- **Sender de email para recordatorios** — el modelo soporta
  `events.reminder_minutes` y `tasks.dueAt` pero no hay job runner ni
  email transport en Fase 1. Se integra con el sender de facturación
  en Fase 2.
- **Upload real de recibos** — el modelo soporta `expenses.receipt_url`
  como text. UI de Fase 1 solo acepta URL externa pegada. Storage
  S3-compatible llega en Fase 2 con Documentos.
- **Dependencias de tareas (bloquea/bloqueada por)** — se difiere a
  Fase 1.5 si hay demanda. Modelo no incluye tabla `task_dependencies`
  todavía.
- **Aprobación masiva de tiempos** — Fase 1 aprueba uno por uno desde
  la tab del caso. Vista bulk en Fase 3 (Reportes).
- **Sincronización bidireccional iCal** — solo export en Fase 1. Import
  e iCal subscriptions en Fase 4.

## F1.9 — Decisiones menores Fase 1

- **TanStack Table:** instalada pero las listas de tiempos/tareas/gastos
  usan `<Table>` semántica directa. Cuando se necesiten filtros de columna
  configurables o sorting client-side, migrar.
- **@dnd-kit:** se usa en el kanban de tareas (`task-kanban.tsx`). Drop
  cambia el estado, no el orden dentro de la columna (no hay campo `order`).
  Si se necesita ordering en Fase 1.5, agregar columna `position int` con
  fractional indexing.
- **FullCalendar:** se carga vía `next/dynamic` para evitar SSR de un
  paquete que toca DOM en module-eval. Locale `es` viene de
  `@fullcalendar/core/locales/es`.
- **`reduce` con tabular-nums:** los totales en `/casos/[id]` se calculan
  en el server component sumando JS — no hay aggregate SQL. Para Fase 0/1
  con seeds chicos es trivial; cuando los volúmenes crezcan, mover los
  resúmenes a queries con `SUM()`.

---

# Fase 2 — Documentos · Notas · Facturación · OCR

Decisiones específicas tomadas durante la Fase 2 (commit en `claude/awesome-montalcini-809449`).
Tests de visibilidad en `tests/integration/fase2-rls.test.ts` (8/8).

## F2.1 — Cascada de visibilidad para tablas hijas de cases (igual que Fase 1)

**Decisión:** `documents`, `notes`, `invoices` heredan visibilidad del caso vía
`app_user_can_see_case`. `invoice_items` y `payments` cascadean a través de
una nueva función `app_user_can_see_invoice` (también `SECURITY DEFINER`)
que delega al helper de caso.

**Implementación:** [`drizzle/migrations/0004_phase2_with_rls.sql`](./drizzle/migrations/0004_phase2_with_rls.sql).
Tests verifican que un lawyer no asignado al caso restringido NO ve los
documentos/notas/facturas/pagos del caso.

## F2.2 — Storage abstraction con driver local en dev

**Decisión:** Interfaz `StorageProvider` con un único driver `LocalStorage`
en Fase 2. Layout: `<STORAGE_ROOT>/<firmId>/<scope>/<entityId>/<filename>`.
Producción puede swapear a S3/R2 implementando la misma interfaz sin tocar
los call sites.

**Implementación:** [`lib/storage/index.ts`](./lib/storage/index.ts) y
[`lib/storage/local.ts`](./lib/storage/local.ts). `STORAGE_DRIVER=local` y
`STORAGE_ROOT=./storage` en `.env`. El directorio `storage/` está en
`.gitignore` — no se commitea contenido de usuarios.

**Pendientes Fase 2.5:** driver S3 con `@aws-sdk/client-s3` o `aws4fetch`,
firmas pre-signed para descargas grandes.

## F2.3 — NCF/e-CF: schema soporta, emisión queda en modo interno

**Decisión:** Las tablas `invoices`, `ncf_counters` ya soportan los cuatro
tipos NCF (B01, B02, E31, E32) y rangos asignados al firm. **Pero la Fase 2
sólo emite en modo interno**: las facturas llevan número `INV-YYYY-NNN`,
`ncf=NULL`, y el PDF muestra el banner "FACTURA INTERNA — NO VÁLIDA PARA
FINES FISCALES" como manda el maestro § 3.9.

**Por qué:** La integración real con la DGII (envío de e-CF, validación de
TrackId, manejo de respuesta) es un proyecto de varias semanas y suele
delegarse a proveedores. Modelar los campos sin emitirlos permite que un
firm con DGII configurada use el sistema mientras mantiene su flujo fiscal
real por otra vía.

**Implementación:** [`lib/invoicing/pdf.tsx`](./lib/invoicing/pdf.tsx)
muestra el banner condicionalmente según `invoice.ncf`. Cuando llegue la
integración (Fase 2.5+ o vía proveedor), poblar `ncf` desde
`ncf_counters` quita el banner automáticamente.

## F2.4 — OCR sincrónico con `tesseract.js`, sin queue

**Decisión:** OCR ocurre **dentro** del server action de upload (sync).
Soporta MIME tipos imagen (JPEG / PNG / WEBP / BMP). Archivos > 5 MB y
todos los PDFs se marcan `ocr_status = 'skipped'` con razón legible —
"PDF OCR (rendering por página) llega en Fase 2.5".

**Por qué:** El maestro § 9.7 mandata OCR real, sin placeholder. Pero
agregar una queue (`pg-boss` o equivalente) es trabajo no-trivial que se
puede diferir sin sacrificar la promesa: las imágenes (que son la
mayoría de las uploads en una firma legal — fotos de recibos) sí tienen
OCR completo y aparecen en búsqueda. PDFs se almacenan honestamente
marcados como pendientes; el usuario sabe que no son indexados aún.

**Implementación:** [`lib/ocr/index.ts`](./lib/ocr/index.ts) +
[`lib/ocr/tesseract.ts`](./lib/ocr/tesseract.ts). Worker `tesseract.js`
con español + inglés se mantiene caliente para la vida del proceso. La
primera invocación descarga ~30 MB de language data a `node_modules/
tesseract.js/.cache`.

**Pendientes Fase 2.5:**
- PDF→image rendering por página con `pdfjs-dist` (puro JS, sin
  ImageMagick), luego OCR de cada página.
- Queue async con `pg-boss` para descargar el camino caliente.

## F2.5 — Calculations: ITBIS por línea + retención ISR a nivel de factura

**Decisión:**
- ITBIS 18% por línea, configurable por línea (`tax_rate` decimal). Default
  0.18 para tiempos (servicios), 0 para gastos (passthrough).
- Retención ISR 10% como toggle por factura (default `true` cuando el
  cliente es `corporate` en la UI; el usuario lo confirma).
- Retención ITBIS 30% **NO se calcula** en Fase 2 — requiere distinguir
  servicios vs bienes a nivel de línea, lo difiero a Fase 2.5.

**Implementación:** [`lib/invoicing/calculate.ts`](./lib/invoicing/calculate.ts).
Funciones puras (`computeLines`, `computeTotals`) que el server action llama
para producir los totales que se persisten en la cabecera de la factura.

## F2.6 — Tiptap richtext: store as JSONB, render con editor en read-only

**Decisión:** `notes.content` es `jsonb` con el documento de Tiptap tal cual.
Rendering en lista usa `extractTiptapText` (helper puro JS que walks el
árbol) para preview de 280 chars. Edición / vista completa usa el mismo
componente `RichTextEditor` con `editable=false`.

**Implementación:** [`components/editor/rich-text-editor.tsx`](./components/editor/rich-text-editor.tsx)
con `@tiptap/react` + `@tiptap/starter-kit`.
[`lib/tiptap/extract-text.ts`](./lib/tiptap/extract-text.ts) hace el text
extraction sin necesitar el editor.

**Por qué JSONB y no HTML:** El maestro lo pide — formato editable
estructurado, no HTML que sea costoso de mutar / sanitizar. Permite
diferenciar tipos de nodo en el futuro (anotaciones, mentions, etc.).

## F2.7 — Diferidos a Fase 2.5+

- **Email sender** para recordatorios de cobro y de eventos: pendiente de
  Fase 2.5 con Resend / Postmark.
- **PDF OCR** vía pdfjs-dist + tesseract.
- **Queue async** con `pg-boss` (OCR + email + futuras tareas).
- **Retención ITBIS 30%** servicios profesionales.
- **Modo fiscal con NCF/e-CF**: UI para configurar rangos en
  Configuración + integración real con DGII (probablemente vía proveedor
  externo en Fase 4).
- **Multi-versión avanzada**: comparar versiones, anotar cambios. Schema
  ya soporta `parent_document_id` chain.
- **Búsqueda full-text** que use `documents.ocr_text`. El campo ya se
  llena; falta el endpoint de search global.

## F2.8 — Decisiones menores Fase 2

- **`text("attendees").array()` y patrón ARRAY explícito**: heredado de
  Fase 1; se aplica por defecto a todo array bound nuevo.
- **PDF generation con `@react-pdf/renderer`**: la ruta es `.tsx` (no
  `.ts`) porque el componente del PDF usa JSX. `renderToBuffer` corre en
  Node runtime de Next.js (no edge).
- **Descarga de archivos**: route handler `/api/documentos/[id]/download`
  con `Content-Disposition: inline` para que el browser previsualice si
  puede. RLS-scoped.
- **/documentos sidebar**: queda como "Pronto" en Fase 2 (sólo accesible
  desde la pestaña Documentos del caso). Vista global en Fase 2.5 o cuando
  haya search full-text.

---

# Fase 2.5 — Facturas con NCF/e-CF (modo fiscal)

Implementa la **numeración** de NCF/e-CF que el maestro § 9.3 mandata.
La emisión electrónica real (envío del XML del e-CF a la DGII y manejo del
TrackId) se delega a un proveedor o a Fase 4.

## F2.5.1 — Cuatro tipos NCF soportados

**Decisión:** El sistema maneja los cuatro tipos vigentes de la DGII:

| Tipo | Uso |
|---|---|
| **B01** | Crédito fiscal en papel — clientes corporativos que toman ITBIS |
| **B02** | Consumidor final en papel — personas físicas |
| **E31** | e-CF crédito fiscal — versión electrónica de B01 |
| **E32** | e-CF consumidor final — versión electrónica de B02 |

Formato 11 caracteres: `${tipo}${seq:08}` → `B0100000001`, `E3100000001`.

**Implementación:**
[`lib/invoicing/ncf.ts`](./lib/invoicing/ncf.ts) — formato + validación regex
+ asignación atómica vía `UPDATE ... WHERE last_seq < range_end` con guardas
de expiración. Errores tipados (`NO_RANGE`, `EXHAUSTED`, `EXPIRED`) para que
la UI muestre mensaje preciso.

## F2.5.2 — Una sola fila por (firm, tipo) en `ncf_counters`

**Decisión:** El esquema mantiene UN rango activo por tipo. Cuando la DGII
asigna un nuevo rango al firm, el usuario actualiza la fila existente en
Configuración → Fiscal (start, end, expires). Los NCFs ya emitidos en
`invoices.ncf` no cambian — son históricos permanentes.

**Por qué no múltiples rangos por tipo:** Simplifica la asignación atómica.
Si en el futuro se necesita stack de rangos, agregar columna `range_id` y
seleccionar el rango activo más antiguo no agotado. Documentado para futura
revisión.

## F2.5.3 — Emisión sin DGII (impresa o PDF) en F2.5; integración real en F4

**Decisión:** En F2.5 el sistema asigna NCF y los imprime en el PDF con texto
legal DGII al pie. NO envía nada a la DGII. El cliente recibe el PDF y lo
usa como soporte de crédito fiscal — el firm reporta el NCF en su 606
manualmente o vía proveedor.

**Por qué:** La integración directa con la DGII (envío del XML del e-CF y
manejo del TrackId) es trabajo de varias semanas, requiere certificado
digital, y la mayoría de firmas RD ya delegan a un proveedor de e-CF
existente (Mercury, eFacturador, etc.). En F4 se evaluará si construir
integración propia o solo agregar un hook al proveedor.

**Implementación:**
- Toggle "Modo fiscal" en el drawer de Generar Factura → switch + selector de tipo
- Si está prendido, la action llama `assignNcf()` dentro de la misma transacción
- Si el rango no está configurado, agotado, o vencido → mensaje preciso
- PDF: oculta el banner "FACTURA INTERNA"; pone NCF en header; agrega párrafo
  "Este documento es un Comprobante Fiscal..." al pie con NCF + RNC del emisor

## F2.5.4 — `/configuracion` activado con tab Fiscal

**Decisión:** La página `/configuracion` deja de ser placeholder. Tabs:
**Fiscal (NCF)** funcional + tres pendientes (Datos del firm, Plantillas,
Tarifas) que serán Fase 3.

**Implementación:**
[`app/(app)/configuracion/page.tsx`](./app/(app)/configuracion/page.tsx) +
[`app/(app)/configuracion/_components/ncf-ranges-panel.tsx`](./app/(app)/configuracion/_components/ncf-ranges-panel.tsx).
Tabla por tipo NCF con estado (Activo / Vence pronto / Vencido / Agotado) +
diálogo de edición con `Dialog` (Radix). Solo admins/socios pueden editar.

## F2.5.5 — Fix de copy del ISR (claridad sobre crédito fiscal)

**Decisión:** El cuadro de totales del drawer Generar Factura ahora separa
explícitamente:
- **Total honorarios brutos** (subtotal + ITBIS — lo que ganas)
- **Retención ISR (10%)** mostrada con leyenda "paga el cliente a DGII por ti"
- **Recibirás del cliente** (lo que efectivamente te transfiere)

Más una nota verde explicando que el ISR retenido es un crédito al pagar el
IR-2 anual, NO una rebaja al honorario. Esto disuelve la confusión común
sobre qué representa el `−` en la línea de retención.

## F2.5.6 — Diferidos a Fase 3+ y Fase 4

- **Múltiples rangos por tipo NCF** (stack histórico) — F3 si emerge necesidad.
- **Integración real con DGII** para emisión de e-CF — F4 o vía proveedor.
- **Recordatorios automáticos por email** cuando un rango se agota o está por
  vencer — Fase 3 con email sender.
- **Soporte para más tipos NCF** (B14 régimen especial, B15 zona franca, etc.) — bajo demanda.

## F2.6 — Edición y eliminación de clientes y facturas (CRUD completo)

**Decisión:**
- **Clientes**: el drawer existente acepta opcionalmente un objeto `cliente`
  inicial; si se provee, opera en modo edit y llama a `editarClienteAction`.
  Botón "Editar" en `/clientes/[id]`.
- **Facturas (drafts)**: nuevo `editarFacturaAction` para encabezado
  (dueOn / notes / terms). Líneas y source items NO se editan post-creación
  para mantener auditoría — para cambiar líneas se elimina el borrador y
  se regenera. `eliminarFacturaAction` hace soft-delete pero solo en
  status `draft`.
- **Facturas sent/paid/partial**: solo se pueden anular (`anularFacturaAction`),
  nunca editar ni eliminar. El cliente ya recibió el comprobante; el rastro
  histórico debe preservarse para DGII / auditoría.

## F2.7 — Validación: NCF B01/E31 requieren RNC del cliente

**Decisión:** Antes de tomar el siguiente NCF de un rango, el server action
valida que el cliente tenga `tax_id_type='rnc'` y `tax_id` no nulo cuando
el tipo es **B01** o **E31** (crédito fiscal). Si no, retorna error con
mensaje específico apuntando a editar el cliente.

**Por qué:** DGII rechaza un comprobante de crédito fiscal sin RNC del
receptor. Validar ANTES de gastar un número del rango evita NCFs huérfanos
en `ncf_counters`. B02 / E32 (consumidor final) NO requieren RNC.

## F2.8 — e-CF (DGII): roadmap a Fase 4 vía proveedor externo

**Decisión:** En Fase 4, integrar la emisión real de e-CF a la DGII
**vía un proveedor externo** (Mercury, eFacturador, Tecnoflex, Hexágono,
etc.). NO integración directa.

**Por qué:**
- Integración directa con DGII requiere certificado digital de empresa
  (Trusted Third Party), implementación SOAP/REST con XML firmado, y
  mantenimiento perpetuo cuando la DGII cambia su API.
- Proveedores existentes ya manejan certificado, comunicación, y compliance.
  Cobran cuota mensual pero ahorran 2-4 semanas de implementación inicial
  + mantenimiento perpetuo.
- La mayoría de firmas RD (incluyendo estudios legales) ya delegan a un
  proveedor — es práctica estándar.

**Plan de implementación (Fase 4):**

1. Definir interfaz `EInvoiceProvider` en `lib/invoicing/providers/`:
   ```ts
   interface EInvoiceProvider {
     emit(invoice, items, firm, client): Promise<{ trackId, status }>;
     getStatus(trackId): Promise<EInvoiceStatus>;
   }
   ```
2. Columnas nuevas en `invoices`: `dgii_track_id`, `dgii_status`,
   `dgii_signed_xml_url`, `dgii_response_at`.
3. UI en `/configuracion/fiscal`: tab "Proveedor e-CF" para configurar
   credenciales API del proveedor seleccionado.
4. Cuando se emita E31 / E32 con proveedor configurado, llamar
   `provider.emit()` después del INSERT y guardar el `trackId`.
5. Worker de polling (con `pg-boss`) que verifica estados pendientes
   cada 5 min hasta que la DGII responda Aceptado/Rechazado.
6. UI muestra estado DGII en el detalle de la factura.

**También diferido a F4:**
- Anulación de e-CF en DGII (formulario específico).
- Recibos de pago electrónicos (otro tipo de e-CF distinto).
- Reporte 606 / 607 generado automáticamente del histórico de invoices.

## F4.1 — Conflict check de interés (§ 9.6 ejecutado)

**Decisión:** El conflict check se ejecuta en runtime contra dos índices ya
existentes desde Fase 0: `clients_firm_tax_id_idx` y
`cases_firm_counterparty_tax_idx`. Al editar un cliente o crear un caso, un
debounce de 350ms invoca `checkConflictsAction(taxId, name, excludeId)` y
muestra un banner no bloqueante en el form. Una página `/conflictos` lista
agregadamente todos los pares (cliente del firm que también es contraparte
en algún caso).

**Diseño clave:**
- **Match por tax_id es la señal fuerte.** Normalizamos a sólo dígitos antes
  de comparar (`regexp_replace(tax_id, '\D', '', 'g')`) para que
  "130-12345-6", "13012345-6" y "13012345 6" cuadren. Match por nombre via
  `ILIKE` sólo se reporta cuando no hay match por tax_id, como advertencia
  débil.
- **Nunca bloquea.** El partner ve la advertencia con links a los registros
  involucrados (y, en caso de contraparte, los abogados que trabajaron ese
  caso) y decide. La firma sigue creando el cliente o caso si confirma.
- **No agrega columnas.** Toda la información ya estaba modelada desde Fase 0
  por la decisión 9.6 — sólo faltaba la consulta + UI.

**Razón de no bloquear:** un sistema legal multi-tenant no debe tomar
decisiones éticas por el partner. Mostrar la información, dejar la decisión.

## F4.2 — Portal Cliente: rol `client` + área `/portal/*` aislada

**Decisión:** El cliente final inicia sesión via `/login` (better-auth
unificado) pero usa un grupo de rutas separado `app/(portal)/portal/*` con
layout, sidebar y header propios. `requirePortalUser()` exige
`role='client'` y `clientId` no nulo; cualquier user con `role='client'`
que aterrice en `/(app)/` es reenviado a `/portal/dashboard`.

**Modelo de datos:**
- `users.client_id uuid` (nullable, FK → clients ON DELETE CASCADE en SQL).
  Siempre nulo para roles staff.
- `documents.shared_with_client boolean DEFAULT false`. Toggle por documento;
  por default oculto para mantener "internal-first".
- La FK `users.client_id → clients.id` se declara **sólo en SQL**
  (migración 0007). Drizzle no la modela en TypeScript porque crea
  circularidad con `clients.created_by → users.id` que rompe inferencia
  de tipos. Comportamiento DB es idéntico.

**Visibilidad:**
- Casos: portal user ve sólo `cases.client_id = user.clientId`.
- Eventos: sólo eventos de los casos del cliente.
- Facturas: sólo `invoices.client_id = user.clientId`. Endpoint
  `/api/facturacion/[id]/pdf` chequea adicionalmente que `inv.clientId =
  user.clientId` cuando `user.role='client'`.
- Documentos: sólo cuando `shared_with_client=true` y el caso pertenece al
  cliente. Endpoint dedicado `/api/portal/documentos/[id]/download` aplica
  ambos filtros.
- **Nunca:** tiempos, gastos, notas, audit log, otros clientes, otros
  usuarios.

**Auth flow:** Admin/partner crea acceso via `invitarPortalAction` desde
`/clientes/[id]` → llama `auth.api.signUpEmail` con
`{ role: 'client', clientId, ... }`. El cliente recibe email + password
temporal fuera de banda y entra en `/login`. better-auth está configurado
con `additionalFields.clientId` opcional para que el campo persista.

**No usamos RLS adicional para client_id**, sólo filtros aplicativos. El
layout exige rol y clientId, las queries del portal siempre filtran
explícitamente. Si más adelante queremos defensa en profundidad, agregamos
una RESTRICTIVE policy en cases/invoices/documents en una migración futura.

## F4.3 — iCal bidireccional (export con token + import desde URL)

**Decisión:** "Bidireccional" en F4 significa **dos direcciones via URL
ICS**, no CalDAV ni Google API. Outlook/Google se suscriben a una URL
pública con token (lectura); el usuario registra URLs ICS externas para
que las parseemos y peguemos eventos en `events` (escritura).

**Out (mi feed):**
- `users.ical_token text` (unique partial idx ignorando NULL). Generado por
  `regenerarIcalTokenAction` (32 bytes hex random).
- `GET /api/calendario/feed/[token].ics` es **público** (no requiere
  sesión). Resuelve el user por token usando la conexión admin, luego
  llama `withFirm` con esa identidad para que RLS aplique al read de
  events. Cache-Control: 5 min para reducir polling de clientes
  calendario.
- Acepta `[token]` y `[token].ics` (Outlook tipicamente añade el sufijo).

**In (calendarios externos):**
- `external_calendar_subscriptions` tabla nueva con RLS. Owner por
  `(firm_id, user_id)`.
- `events.external_subscription_id + external_uid` con unique partial idx
  para idempotencia. Re-sync no duplica.
- `syncSubscriptionAction`: fetch (timeout 8s) + parser ICS hand-rolled
  en `lib/ical/parse.ts` (no añadimos `ical.js` por ~400KB de bundle).
  Soporta SUMMARY/DESCRIPTION/LOCATION/DTSTART/DTEND con DATE y DATETIME
  (UTC + floating tratado como UTC). Ignora RRULE, VTIMEZONE, alarmas.

**Diferido a fases siguientes:**
- Push real bidireccional (CalDAV / Google API / Microsoft Graph): cada
  uno con su autenticación, modelo de cambios, y manejo de conflictos.
  Es proyecto propio.
- RRULE: requiere expansión de recurrencia en la base. Posible en F5+.
- Sync periódico automático: por ahora es manual con botón "Sincronizar".
  Vercel Cron o pg-boss cuando emerja la necesidad.

## F4.5 — Hooks de seguridad y deactivation cascade

Tres bugs aparecieron al pulir Fase 4. Los tres se cierran con hooks
nativos de better-auth (`databaseHooks.user.create.before`,
`databaseHooks.session.create.before/after`) y un cascade en
`softDeleteClient`.

### Bug 1 — invitar cliente sustituía la sesión del admin

`auth.api.signUpEmail` con `autoSignIn: true` (config global) crea
sesión para el nuevo user. El plugin `nextCookies()` planta el
`Set-Cookie` en la respuesta del server action y sobrescribe la cookie
del admin que invitó.

**Fix:** `invitarPortalAction` ya no usa `signUpEmail`. Ahora va por
`auth.$context.internalAdapter.createUser` + `linkAccount` directo, lo
que crea el user sin tocar cookies. El admin queda autenticado.

### Bug 2 — public signup permitía inyección de role/firmId/clientId

`POST /api/auth/sign-up/email` está expuesto por better-auth y aceptaba
`role` / `firmId` / `clientId` en el body. Un atacante con el `firmId`
de otra empresa podía crear un user `role=admin` dentro de ella.

**Fix:** hook `user.create.before`. Cuando el contexto es `null` (server
action interna) no toca nada. Cuando hay contexto (HTTP público):
- Verifica que el `firmId` no tenga aún users (legítimo solo en flow
  de primer admin via `/signup`).
- Fuerza `role=admin` y `clientId=null`.

Para añadir staff a un firm existente hay que pasar por código backend
(`internalAdapter.createUser`); el endpoint público queda solo para
self-signup de nuevos firms.

### Bug 3 — soft-delete de cliente no cortaba acceso al portal

Antes, archivar un cliente no afectaba sus portal users. Seguían
logueados (cookie cache), podían volver a iniciar sesión, y veían sus
casos hasta que la RLS los detenía (no lo hacía: `cases.client_id` ya
no aparece visible si el cliente está deletedAt — pero el portal layout
sí los autenticaba).

**Fix en cascada:**
- `softDeleteClient` ahora hace soft-delete también de los portal users
  del cliente y borra sus filas en `sessions` (kill cookie).
- `getCurrentUser` agrega un PK lookup que rechaza users con
  `deletedAt IS NOT NULL`. Esto cubre el cookie cache de 5 min.
- Hook `session.create.before` rechaza creación de sesión si el user
  está soft-deleted. Cubre el caso "el user re-autentica con su
  password después del soft-delete" — antes la sesión se creaba y solo
  fallaba en el siguiente render.

### Bonus — lastLoginAt + status active automáticos

Hook `session.create.after` actualiza `users.lastLoginAt` y bumpa
`status` de `invited` a `active` al primer login. El badge "invited"
en el card "Acceso al portal" de `/clientes/[id]` ahora se sincroniza
con la realidad.

## F5 — Capa de IA (Claude API)

**Decisión:** la IA es **un módulo aislado y opcional** detrás de la
variable `ANTHROPIC_API_KEY`. Si no está set, los puntos de entrada IA
no se renderizan en el UI y el resto de la app funciona normal. Esto
respeta dos cosas: (a) no toda firma quiere mandar contenido a un
proveedor LLM, (b) los costos de API se asumen explícitamente al
configurar la key.

**Provider:** Claude vía `@anthropic-ai/sdk`. Modelo por default
`claude-sonnet-4-6` (balance calidad/coste para legal); `ANTHROPIC_MODEL`
permite override. Llamadas todas server-side; nunca se expone la key al
browser.

**Arquitectura del módulo (`lib/ai/`):**
- `claude.ts` — único cliente. `runPrompt(messages, opts)` con system
  preamble fijo: rol "asistente legal RD", prohibición de inventar leyes
  / artículos / RNC / NCF / nombres de tribunales que no estén en el
  contexto.
- `tiptap-text.ts` — extrae texto plano de notas Tiptap para mandarlas a
  prompts.
- `case-summary.ts`, `note-assist.ts`, `document-search.ts` — un archivo
  por feature, cada uno con su query gather + prompt builder.

### F5.1 — Foundation
- Tab "IA" en `/configuracion` muestra estado (Activo / No configurado),
  modelo en uso, instrucciones para configurar la key, y disclaimer
  privacidad ("Anthropic API tiene política no-training por default,
  pero los datos viajan a sus servidores").

### F5.2 — Resumen de caso (`/casos/[id]` → botón "Resumen IA")
Junta caso + cliente + eventos + notas + tiempos + gastos + OCR de
documentos (con caps por sección — 30 events, 20 notas, 1500 chars por
nota, 30 docs con 1200 chars de OCR cada uno) y pide a Claude un
resumen ejecutivo con secciones fijas: Hechos, Estado, Próximos pasos,
Riesgos, Métricas. Botón "Guardar como nota" wrappea el resultado en
un Tiptap doc mínimo y crea una nota del caso.

### F5.3 — Mejorar redacción de notas
Botón "Mejorar redacción" en el drawer de notas. Toma el contenido
Tiptap actual, lo convierte a texto plano, pide a Claude que lo refine
manteniendo "TODOS los hechos, fechas, nombres y números exactos".
Reemplaza el contenido del editor con el texto refinado dividido en
párrafos. Cliente puede editarlo después o regenerar.

**Limitación conocida:** se pierde formato Tiptap (negritas, listas).
Para preservarlo habría que pedirle a Claude que devuelva HTML/Markdown
+ parsearlo de vuelta a nodos Tiptap. Está fuera de scope F5.

### F5.4 — Búsqueda semántica de documentos
Sin embeddings/pgvector. Estrategia: ILIKE permisivo para narrowing
(top 30) → fallback a "30 docs más recientes con OCR" si ILIKE retorna
nada → mandar la lista (con OCR truncado a 1500 chars/doc) + la pregunta
del usuario a Claude → pide JSON estricto con `[{index, score 0-10,
reason}]`, filtra score < 4. Caja "Búsqueda IA" arriba de la tabla
existente en `/documentos`.

**Por qué no embeddings:** mantenerlo todo en Postgres sin extensión
pgvector + sin job de indexación es operacionalmente más simple para un
firm pequeño-mediano. El costo es 1 llamada a Claude por búsqueda IA
(no por documento), aceptable. Si emerge volumen, migrar a pgvector +
nightly re-embed es el siguiente paso.

### Diferidos a F5.5+
- Redactar notas desde cero a partir de un prompt del usuario
  ("Redacta una carta de cobro al deudor por DOP 50,000").
- Búsqueda semántica preserva formato Tiptap.
- Streaming de respuestas IA (ahora la UI espera el bloque completo).
- Embeddings + pgvector cuando documentos > ~500.
- Cost tracking en `/reportes` (los `usage` ya vienen en cada response).
- Auto-resumen on demand desde el dashboard ("¿qué pasó esta semana?").

---

# Fase 6 — Organización de documentos por carpetas + endurecimiento de headers

Bloque ejecutado a pedido del jefe del firm: en una firma legal, el material
de cada caso típicamente vive en una carpeta del filesystem que el cliente o
contraparte entrega completa. Hasta acá, los documentos se subían "planos" al
caso. F6 introduce un sistema de carpetas estilo explorador de archivos
(Windows Explorer / macOS Finder) con jerarquía ilimitada y soporte para
preservar la estructura al subir una carpeta entera.

Migraciones nuevas:
- `0025_glossy_sunspot.sql` — agrega `clients.registro_mercantil` (text
  nullable). El nombre autogenerado se mantuvo, pero el contenido se reescribió
  a mano porque drizzle-kit produjo una migración monstruosa que reflejaba el
  drift entre `schema.ts` y el último snapshot (problema documentado abajo).
- `0026_folders.sql` — nueva tabla `folders` + columna `documents.folder_id`
  + RLS + índices.

## F6.1 — Tabla `folders` con scope opcional (firm-wide / case / client)

**Decisión:** un mismo registro `folders` puede vivir a nivel de firm (las
dos columnas de scope `case_id` y `client_id` son NULL), a nivel de caso
(`case_id NOT NULL`), o de cliente (`client_id NOT NULL`). La jerarquía
ilimitada se modela con `parent_folder_id` self-FK + `ON DELETE CASCADE`. Una
columna `path` materializada ("/Demandas/2026") sirve para breadcrumbs y
búsquedas tipo "todo lo que cuelgue de /Demandas" sin CTE recursiva.

**Implementación:**
- Schema: [`lib/db/schema.ts`](./lib/db/schema.ts) — bloque "folders" justo
  antes de "documents".
- Self-FK declarada en SQL (no en Drizzle) para evitar circularidad de tipos.
- Unicidad por nivel: `UNIQUE (firm_id, parent_folder_id, name) WHERE deleted_at IS NULL`.
  Permite reusar el nombre tras borrar la carpeta.
- Queries: [`lib/db/queries/folders.ts`](./lib/db/queries/folders.ts) expone
  `listFolderChildren`, `getFolderBreadcrumb`, `createFolder`,
  `findChildFolderByName` (idempotencia del upload), `softDeleteFolder` (con
  CTE recursiva por subárbol) y `moveDocumentToFolder`.

**Por qué scope múltiple en la misma tabla:** un firm legal mediano va a
tener decenas de miles de carpetas distribuidas entre cientos de casos.
Modelar tablas separadas por scope dispersaría la lógica de RLS y la UI
sin ganancia. Una tabla bien indexada + una policy es más simple.

**Pendientes:** mover carpetas entre niveles (firm → caso) requiere una
operación que recalcule el `path` de todo el subárbol — F6.5.

## F6.2 — RLS de `folders` reusa `app_user_can_see_case`

**Decisión:** la policy de `folders` filtra por `firm_id` siempre + si la
carpeta vive dentro de un caso, además respeta la visibilidad de ese caso
(función `app_user_can_see_case` definida en `0001_fix_rls_recursion.sql`).
Las carpetas firm-wide quedan visibles para todos los staff del firm.

**Implementación:** [`drizzle/migrations/0026_folders.sql`](./drizzle/migrations/0026_folders.sql)
— policy `folders_firm_visibility`. Reusar el helper SECURITY DEFINER
evita la recursión con `case_assignments` que ya se resolvió en Fase 1.

**Por qué:** si un caso es `restricted`, sus carpetas también deben
ocultarse para abogados no asignados. Los documentos dentro de esas carpetas
ya estaban protegidos via `documents.case_id` + helper, ahora las carpetas
heredan el mismo régimen.

**Pendientes:** test `tests/integration/folders-rls.test.ts` (no escrito
en esta tanda — agregar antes de que la feature gane más complejidad).

## F6.3 — Upload de carpeta entera con `webkitdirectory`

**Decisión:** el browser ya entrega `webkitRelativePath` en cada `File`
cuando el input usa `type="file" webkitdirectory`. Server-side parseamos
esos paths para construir el árbol de carpetas que falta crear + bindear
cada archivo a su carpeta correcta.

**Implementación:**
- [`app/_actions/carpetas/subir-carpeta.ts`](./app/_actions/carpetas/subir-carpeta.ts) —
  ordena directorios por profundidad, crea con `findChildFolderByName +
  createFolder` (idempotente: re-subir la misma estructura no falla), luego
  itera files con su `folderId` resuelto.
- [`app/(app)/documentos/_components/upload-folder-button.tsx`](./app/(app)/documentos/_components/upload-folder-button.tsx) —
  el button + input(webkitdirectory) que arma el FormData.
- Caps: 200 archivos, 500 MB total, 25 MB/archivo. Devuelve `filesFailed[]`
  para que la UI muestre cuáles fallaron sin abortar el resto.

**Por qué no diferencia ZIP:** soportar ZIP requiere descompresor server-side
+ manejo de paths sin separador estándar entre Win/Mac. `webkitdirectory`
en cambio es nativo en Chrome/Edge/Safari/Firefox modernos. Si en algún
momento un user necesita subir ZIP (ej. desde un device sin file picker
recursivo), agregamos un endpoint que descomprima con `unzipper`.

## F6.4 — UI estilo explorador: breadcrumb + grid + ?folder= URL state

**Decisión:** la navegación entre carpetas usa query string `?folder=<id>`.
Esto vuelve cada vista linkeable y respeta el back/forward del browser. El
componente `FolderBrowser` muestra breadcrumb arriba, grid de carpetas, y
lista de documentos en el nivel actual.

**Implementación:**
- [`app/(app)/documentos/_components/folder-browser.tsx`](./app/(app)/documentos/_components/folder-browser.tsx) —
  componente genérico. Acepta `extraParams` para preservar query state del
  caller (ej. la página de caso preserva `?tab=documentos`).
- Página global: [`app/(app)/documentos/page.tsx`](./app/(app)/documentos/page.tsx) —
  modo carpetas default. Cuando hay `?q=` o `?shared=1`, cae al modo
  "búsqueda plana" con la tabla histórica.
- Página por caso: [`app/(app)/casos/[id]/page.tsx`](./app/(app)/casos/%5Bid%5D/page.tsx) —
  tab "Documentos" renderiza `CaseFolderBrowser` y deja `CaseDocumentsSection`
  (vista plana con search en memoria) dentro de un `<details>` colapsable
  abajo como fallback.

**Por qué default carpetas y no flat:** una firma con miles de docs no
puede usar la lista plana — se vuelve inmanejable. La búsqueda sigue ahí
para cuando recuerdan el nombre pero no la ruta.

## F6.5 — Versionado de documentos: UI implementada sobre schema existente

**Decisión:** el schema ya tenía `documents.version` y `documents.parent_document_id`
desde Fase 0 (modelado a futuro). F6 finalmente prendió la UI: cada fila
muestra un botón "Nueva versión" que abre un dialog con file picker. La
versión vieja queda intacta (no se borra), apuntada como `parent_document_id`
de la nueva. Tags, caso, cliente, y permiso `shared_with_client` se heredan
del padre.

**Implementación:**
- Action: [`app/_actions/documentos/nueva-version.ts`](./app/_actions/documentos/nueva-version.ts).
- Componente: [`app/(app)/documentos/_components/document-new-version-button.tsx`](./app/(app)/documentos/_components/document-new-version-button.tsx).
- Aparece en `DocumentGlobalRow` y `DocumentRow` (per-caso).

**Por qué no auto-reemplazar la v1:** auditoría legal. Saber qué decía la
v1 de un contrato cuando se firmó es crítico si después hay disputa. La
v2 es para correcciones / addendums, no para "tapar" cambios.

**Pendientes:** UI para diff entre versiones (F6.5 deferred).

## F6.6 — `pnpm db:generate` no es confiable: hand-written migrations es la norma

**Hallazgo durante F6:** ejecutar `pnpm db:generate` para crear la migración
de `registro_mercantil` produjo un SQL gigantesco con 40+ cambios — todas
las tablas y columnas que el schema acumuló desde la última `_meta` snapshot
del journal de drizzle, que estaba muy desactualizada respecto a las
migraciones efectivamente aplicadas (escritas a mano).

**Decisión:** dejar `_journal.json` actualizado al agregar migraciones pero
NO confiar en `db:generate` para producir SQL — las migraciones se siguen
escribiendo a mano con el estilo existente (comentarios contextuales,
`IF NOT EXISTS` para idempotencia, RLS explícita en la misma migración).

**Mitigación:** el `0025_glossy_sunspot.sql` se reescribió manualmente
después de generarse. El snapshot autogenerado (`meta/0025_snapshot.json`)
se borró para no contaminar futuras comparaciones.

**Acción pendiente:** documentar este patrón en `README.md` para que un
contributor nuevo no asuma que `pnpm db:generate` "just works".

## F6.7 — Endurecimiento de headers de seguridad

**Decisión:** agregar Content-Security-Policy, restringir
`Access-Control-Allow-Origin` al dominio del firm, y sumar las policies
COOP/CORP. Hasta F6, Vercel servía `Access-Control-Allow-Origin: *` por
default y no había CSP — gap detectado en la auditoría de la sesión.

**Implementación:** [`vercel.json`](./vercel.json) → bloque `headers`
matching `/(.*)`. CSP permisiva en `script-src` (incluye `'unsafe-inline'`
porque Next.js inyecta scripts inline para hidratación) pero estricta en
`frame-ancestors`, `object-src` y `connect-src`. Permitidos: self,
`api.anthropic.com` (módulo IA), `vitals.vercel-insights.com`,
fonts Google.

**Por qué no nonce-based CSP:** requiere middleware que reemplace el nonce
en cada request — trabajo no trivial y no ataca un threat realista para
esta app (no recibe contenido de terceros). Si en el futuro se permitan
embeds, evaluar.

**Pendientes:** correr Mozilla Observatory contra el dominio después del
próximo deploy para verificar el score.

## F6.8 — Refactor del flujo "crear cliente desde caso"

**Decisión:** eliminar el mini-form (`ClienteQuickCreate`) y la action
inline (`crearClienteInlineAction`) que existían específicamente para crear
clientes sin perder contexto del caso. Reemplazo: el `ClienteFormDrawer`
completo acepta un prop `onCreated?: (client) => void`. Cuando se provee,
después de crear no redirige a la ficha del cliente — llama el callback
con el cliente recién creado y cierra. El form de caso usa esta variante.

**Implementación:**
- `crearClienteAction` ya no llama `redirect()` — retorna
  `{ ok: true, client: { id, displayName } }`.
- `ClienteFormDrawer` decide: si `onCreated`, lo llama; si no, navega.
- Archivos eliminados: `app/(app)/casos/_components/cliente-quick-create.tsx`,
  `app/_actions/clientes/crear-inline.ts`.

**Por qué:** la queja directa del user fue UX — el quick-create capturaba
solo 4 campos (tipo, nombre, email, teléfono) y el resto había que
completarlo después desde la ficha. Ahora el form completo aparece como
un Sheet encima del Sheet del caso (Radix lo soporta).

## F6.9 — Campo `registro_mercantil` opcional en clientes

**Decisión:** sumar columna `clients.registro_mercantil` (text nullable)
para capturar el número de Registro Mercantil que las Cámaras de Comercio
y Producción asignan a personas jurídicas en RD. Hasta ahora el sistema
solo guardaba RNC en `tax_id`, lo que obligaba a meter el RM en `notes`
o al margen.

**UI:** el form de cliente ahora hace el `type` controlado por estado.
Cuando `corporate`, aparecen **Razón social** (obligatoria, ya estaba) +
**Registro Mercantil** (opcional, nueva). Cuando `individual`, ambos
se ocultan y se envían vacíos en hidden inputs para no dejar valores
"fantasma" del cliente previo.

**Por qué opcional:** clientes existentes pueden no tenerlo capturado;
forzarlo rompería el form en edit. Si más adelante se quiere obligatorio
para nuevos corporates, se cambia el `superRefine` en el Zod schema.

## F6.10 — Diferidos a F6.5+

- Mover carpetas entre niveles + recálculo del `path` materializado del
  subárbol.
- Diff visual entre versiones de documento.
- Drag & drop para mover documentos entre carpetas (la lib `@dnd-kit`
  ya está instalada por Fase 1 — solo falta el handler).
- Folders compartidas con el cliente vía portal (hoy solo documentos
  individuales con `shared_with_client`).
- Tests RLS para folders + E2E del flujo "crear cliente desde caso".
- Paginación del listado global de documentos (hoy capeado en 100).

---

# Fase 7 — Direct upload via presigned URLs (hasta 500 MB)

Pedido del usuario: "el tope de 25 MB me queda chico, necesito subir
escaneos de expedientes de 100+ MB". Auditoría rápida descubrió varios
chokepoints en cascada (los 5 caps de cliente, server, Next, Vercel y
memoria de función). Bumpear números no escala — la arquitectura tenía
que cambiar.

## F7.1 — Direct upload del browser al storage, no via Vercel function

**Decisión:** el archivo viaja **directo** del browser al storage
(R2/S3 en prod, endpoint local con HMAC en dev). La Vercel function
solo emite la URL firmada y registra el documento en DB después. Cero
bytes del archivo pasan por la función.

**Por qué:** Vercel Hobby tiene 4.5 MB de body cap por request. Pro
permite hasta 100 MB con config. Para una firma con escaneos de
expedientes de 200-500 MB la única opción viable es bypaso del
function — el patrón estándar de la industria (S3 presigned URLs).

**Implementación:**
- Interface: [`lib/storage/index.ts`](./lib/storage/index.ts)
  `presignedPut(key, contentType, sizeBytes)` añadido al StorageProvider.
- S3Storage: usa `getSignedUrl` de `@aws-sdk/s3-request-presigner`
  (paquete nuevo en este commit) con un `PutObjectCommand`. URL válida
  15 min por default.
- LocalStorage: emite `/api/uploads/local?key=...&exp=...&sig=...` donde
  `sig` es HMAC-SHA256 de `${key}:${exp}` con `BETTER_AUTH_SECRET`.
  Endpoint [`/api/uploads/local/route.ts`](./app/api/uploads/local/route.ts)
  verifica + acepta el PUT. Esto deja que dev ejercite el mismo flow
  sin necesitar R2 corriendo local.
- Acción `prepararUploadAction`
  ([`app/_actions/documentos/preparar-upload.ts`](./app/_actions/documentos/preparar-upload.ts)) —
  recibe metadatos (filename, contentType, sizeBytes, scope), devuelve
  presigned URL + storageKey. Tope 500 MB en el schema Zod.
- Acción `completarUploadAction`
  ([`app/_actions/documentos/completar-upload.ts`](./app/_actions/documentos/completar-upload.ts)) —
  recibe storageKey + metadatos, crea record en `documents`, dispara
  OCR si el size cabe en el cap del OCR module.
- Helper client-side [`lib/uploads/client.ts`](./lib/uploads/client.ts)
  `uploadFileDirect(opts)` — encapsula los 3 pasos: preparar → PUT XHR
  con `upload.onprogress` para barra de progreso → completar.

**Resultado:** tope efectivo 500 MB por archivo (configurable en el
schema). El proceso de Vercel function dura segundos (genera URL +
registro DB), no minutos (no buffereo del archivo). Cero memoria
consumida por archivo en la función.

## F7.2 — OCR sigue funcionando, con corte de seguridad

**Decisión:** archivos ≤ `OCR_MAX_BYTES_CLAUDE` (10 MB) siguen pasando
por OCR. Para archivos más grandes el record se crea con
`ocr_status='skipped'` sin descargar — no tiene sentido bajar 200 MB
a la function solo para que `getOcr()` los tire.

**Implementación:** `completarUploadAction` chequea size antes del
`after()`. Si excede el cap, hace solo `updateDocumentOcr(skipped)`.
Si cabe, descarga via `storage.get(key)` y corre OCR como antes.

## F7.3 — CSP actualizada para permitir conexiones a R2

**Decisión:** agregar `https://*.r2.cloudflarestorage.com` y
`https://*.amazonaws.com` a `connect-src` del CSP en
[`vercel.json`](./vercel.json). Sin esto, el browser rechaza el PUT al
storage (CSP bloquea XHR a domains no listados).

## F7.4 — Validación post-upload diferida

**Decisión:** `completarUploadAction` NO verifica que los bytes en el
storage coincidan con lo declarado (filename/mime/sizeBytes). El cliente
podría declarar 1 MB y subir 500 MB — el record en DB tendría
`sizeBytes=1MB` pero el storage el archivo real.

**Por qué se acepta hoy:**
- El storageKey lo generó el server (firmId/scope/entityId — el cliente
  no elige el path).
- R2 firma con SigV4 + ContentType — si el cliente intenta cambiar el
  type, la firma falla.
- El audit_log captura el upload, así que cualquier abuso queda
  rastreado.

**Pendiente F7.5:** worker async que descarga, detecta magic bytes,
actualiza `mimeType` real, y marca el doc como `mismatch_flagged` si
hay discrepancia grande con lo declarado.

## F7.5 — Bug: `export const` desde un archivo `"use server"` rompe el bundle

**Síntoma:** después del primer deploy de Fase 7, TODOS los uploads (hasta
archivos de 159 KB) fallaban con el error genérico de React "An error
occurred in the Server Components render". No quedaba claro qué fallaba.

**Causa raíz:** `prepararUploadAction` vivía en un archivo con directiva
`"use server"` al tope, pero también exportaba `MAX_UPLOAD_BYTES` como
`const`. La spec de Next.js Server Actions exige que TODOS los exports de
un archivo "use server" sean **funciones async**. Mezclar un `const` causa
comportamiento indefinido en el bundle de producción:
- El build pasa sin error (Next.js no enforza estrictamente).
- En runtime, los client components que importan el `const` reciben algo
  inesperado (typicamente `undefined` o un proxy roto).
- Cuando el client component evalúa el import, tira en producción con la
  exception genérica de React.

**Fix:** mover el `const` a `lib/uploads/limits.ts` (archivo SIN "use
server"). Las server actions y los client components pueden importarlo
sin violar la regla.

**Regla del proyecto a futuro:** un archivo con `"use server"` SOLO
exporta funciones async (los `export type` son OK porque se erasen en
compile time, pero `const`/`let`/`var`/`class` no).

## F7.6 — Bug: `softDeleteFolder` con `LIKE '%'` nullaba folder_id de TODO el firm

**Síntoma:** al borrar UNA carpeta, los documentos de TODAS las carpetas
del firm volvían a la raíz (folder_id = NULL). Datos de organización
silenciosamente destruidos.

**Causa raíz:** mi query del paso 2 (mover docs a root al borrar folder)
tenía un OR mal escrito:
```sql
WHERE folder_id = X OR folder_id IN (
  SELECT id FROM folders WHERE path LIKE '%' OR parent_folder_id = X
)
```
`LIKE '%'` matchea TODAS las filas con `path` no-null. Como `path` tiene
default `'/'` (no nullable), todos los folders del firm calificaban.
Entonces la inner select devolvía TODOS los folder IDs → el outer UPDATE
nulleaba folder_id de TODOS los docs del firm.

**Fix:** usar CTE recursiva (la misma del paso 1) que solo enumera el
subárbol del folder a borrar. Sin `LIKE '%'`.

**Diferidos a F7.5+:**

- Worker async para verificar bytes vs metadata declarada (F7.4).
- Multipart upload para archivos > 5 GB (R2 lo soporta nativo, hay que
  implementar el lado cliente).
- ✅ ~~Borrar~~ `app/_actions/documentos/upload.ts`, `upload-global.ts`,
  `nueva-version.ts` — borradas en cleanup post-F7. Sólo viven en git
  history.
- Re-process OCR de docs > 10 MB cuando llegue un OCR worker en
  background (post-Fase 7).

## F7.6 — Setup operacional

Ver [`docs/R2-SETUP.md`](./docs/R2-SETUP.md) para la guía de configuración
de Cloudflare R2 (bucket + CORS + API token + env vars en Vercel).


