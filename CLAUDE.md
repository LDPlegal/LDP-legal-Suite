# CLAUDE.md — LDP Legal Suite

> **LÉEME PRIMERO — OBLIGATORIO para CUALQUIER sesión de Claude, CUALQUIER cuenta.**
> Este archivo es la fuente de verdad del estado del proyecto y el registro de
> traspaso entre sesiones/cuentas. **Trabajamos con varias cuentas de Claude en
> paralelo**, así que seguí este protocolo SIEMPRE para no duplicar trabajo:
>
> 1. **ANTES de empezar**: `git pull`, leé este archivo COMPLETO (estado de
>    features + la sección "🚧 Trabajo en curso"), y revisá `git log` reciente.
>    Si lo que ibas a hacer ya está hecho o **reclamado** por otra cuenta, NO lo
>    repitas — elegí otra cosa o coordiná.
> 2. **AL EMPEZAR una mejora**: reclámala en la sección "🚧 Trabajo en curso"
>    (abajo), commiteá y pusheá ESE cambio de una vez, para que la otra cuenta lo
>    vea enseguida.
> 3. **AL TERMINAR**: sacá tu fila de "🚧 Trabajo en curso", añadí una entrada a la
>    "Bitácora de sesiones" (fecha, qué, por qué, archivos/commits, pendientes) y
>    actualizá "Estado de features". Commiteá todo junto.
> 4. **Si encontrás que otra cuenta ya hizo lo tuyo** (colisión): descartá tu
>    versión y quedate con la de `origin/main` (no la pises); dejá constancia en
>    la bitácora.
>
> Este protocolo es parte del trabajo, no opcional. Si sos otra cuenta leyendo
> esto: seguilo igual y mantené vivo este archivo.

---

## 🚧 Trabajo en curso (reclamá tu tarea aquí antes de empezar)

> Una fila por mejora activa. Al terminar, borrá tu fila y pasá el resumen a la
> Bitácora. Si una fila lleva días sin avanzar, asumila libre.

| Desde | Cuenta / sesión | Mejora en curso | Archivos/área |
|-------|-----------------|-----------------|---------------|
| 2026-07-09 | Claude (cuenta principal) | **Auditoría exhaustiva multi-agente (11 áreas) + fixes de lo confirmado** | toda la app (solo lectura en la auditoría; fixes puntuales después) |

---

## Qué es esto

App web para el bufete **LDP Legal Advisors** (producción: **app.ldplegal.com.do**).
Gestión de casos/expedientes, clientes, documentos, tiempos, gastos, facturación
(NCF/DGII República Dominicana), calendario, portal de clientes y asistente IA.

- **Stack**: Next.js 15 (App Router) · React 19 · TypeScript · Drizzle ORM ·
  PostgreSQL con **RLS multi-tenant** · better-auth · Tailwind · shadcn/ui ·
  Anthropic SDK. Gestor de paquetes: **pnpm**.
- **Repo**: `origin/main` en GitHub (`GendrickAlv/LDP-legal-Suite`). El deploy es
  push-a-main → Vercel despliega automático (proyecto `ldp-legal-suite`).
- **La app vive en la RAÍZ del repo.** La carpeta `sitefinal/` es un **sitio
  estático aparte (RD Vial)**, sin relación con la app — no la toques ni la
  commitees como parte de la app.
- Docs de fondo: `README.md` (setup) y `DECISIONS.md` (decisiones de arquitectura,
  esp. §9 sobre RLS multi-tenant). Este CLAUDE.md no los duplica.

## Reglas críticas (romper esto rompe producción)

1. **Acceso a BD SOLO vía `withFirm(firmId, userId, fn)`** (`lib/db/with-firm.ts`).
   Abre una transacción y setea `app.firm_id` / `app.user_id` para RLS. Dentro
   del callback usá **siempre `tx`**, nunca `db` (queda fuera de la tx y RLS
   rompe o filtra datos entre firmas).
2. **Dos conexiones**: `lib/db/client.ts` = rol `app_user` (NOBYPASSRLS, runtime,
   sujeto a RLS). `lib/db/admin.ts` = owner (bypassa RLS) — SOLO migrate/seed/
   better-auth/signup, jamás en código de requests.
3. **Migraciones**: SQL escrito a mano en `drizzle/migrations/NNNN_desc.sql`,
   numeración secuencial de 4 dígitos + entrada manual en
   `drizzle/migrations/meta/_journal.json` (idx, when incremental, tag).
   Separá sentencias con `--> statement-breakpoint`. Toda tabla con `firm_id`
   habilita RLS con política `<tabla>_firm_isolation` (ver 0018 como ejemplo).
   **Próxima migración: `0035`** (la última es `0034_user_preferences`).
4. **Deploy = migración**: `vercel.json` tiene
   `buildCommand: "pnpm run db:migrate:deploy && pnpm run build"`. Es decir,
   **cada deploy aplica automáticamente las migraciones pendientes a Neon**
   (`scripts/migrate-deploy.ts`) antes de compilar. No hay que aplicarlas a mano.
   Si una migración falla, el build falla y NO se publica código incompatible.
5. **Roles**: `admin | partner | lawyer | paralegal | tester | client`. Guards en
   `lib/auth/session.ts` (`requireUser`, `hasAdminPowers`, etc.). Los `client`
   van al portal (`/portal`), no a la app de staff.

## Comandos

```
pnpm dev                 # dev server
pnpm typecheck           # tsc --noEmit  (CORRÉLO SIEMPRE antes de commit)
pnpm build               # next build
pnpm test                # vitest (tests de integración RLS; necesitan BD sembrada)
pnpm db:migrate          # bootstrap local: crea DB + rol + schema + RLS + grants
pnpm db:migrate:deploy   # solo aplica migraciones pendientes (lo que corre Vercel)
pnpm db:seed             # datos de prueba (better-auth; requiere secretos reales en .env)
```

Dev local: Postgres nativo en Windows, credenciales en `.env` (gitignored).
Nota: `pnpm db:seed` puede fallar si el `.env` local no tiene los secretos reales
(BETTER_AUTH_SECRET, APP_CRYPTO_MASTER_KEY, etc.) — es limitación de entorno, no
del código; los tests de integración dependen de que el seed haya corrido.

## Estado de features

- ✅ **Expedientes vinculados (casos hijos)** — un caso puede contener expedientes vinculados (`parent_case_id`,
  código derivado `PADRE-NN`). Tab "Expedientes vinculados" en el detalle, badges en listas,
  guards de archivar/restaurar. Migración `0032`. **En producción.**
- ✅ **Vista previa de documentos** — clic en el nombre abre preview
  (`DocumentPreviewDrawer`), con menú de acciones ⋮, carpetas y docs privados.
  **En producción.**
- ✅ **Dashboard personalizable con widgets** — cada usuario elige qué widgets ve
  y en qué orden (mostrar/ocultar + reordenar con ↑/↓ desde "Personalizar").
  Preferencias en `users.preferences` jsonb (migración `0034`). Registry en
  `lib/dashboard/widgets.ts`; el dashboard resuelve el layout mezclando prefs +
  registry (widgets nuevos aparecen solos). 12 widgets, incluyendo nuevos
  (KPI mis tareas, Casos recientes). Migración `0034`. **En producción.**

## Protocolo de traspaso entre sesiones/cuentas

1. Al empezar: `git pull`, leé este archivo y revisá `git log` reciente.
2. Al terminar cualquier trabajo: **añadí una entrada abajo** en "Bitácora de
   sesiones" y commiteala junto con tu cambio. Mantené el formato.
3. Commits: mensajes descriptivos (qué y por qué). No commitees `sitefinal/`,
   `.env`, ni `.vercel/`.

---

## Bitácora de sesiones

### 2026-07-09 — Más widgets de dashboard + badge Audiencia + fetch condicional
- **3 widgets nuevos** (default ocultos, elegibles desde "Personalizar"):
  `agenda_hoy` (eventos de hoy, derivados de los próximos 7 días sin query
  extra), `facturas_vencidas` (facturas con saldo y `dueOn` pasado — reusa
  `listInvoices`), `tareas_equipo` (tareas pendientes de toda la firma — reusa
  `listTasks`). Registro en `lib/dashboard/widgets.ts`, render en el mapa
  `nodes` de `dashboard/page.tsx`.
- **Fetch condicional**: el dashboard resuelve el layout ANTES del `Promise.all`
  y solo consulta los widgets "pesados" (`casos_recientes`, `facturas_vencidas`,
  `tareas_equipo`) si el usuario los tiene activos (`vis(id)`). Personalizar
  ahora también aligera la BD.
- **Mejora estilo Gabriel (foco en audiencias)**: `listEventsInRange` ahora trae
  `eventType`; los widgets "Próximos 7 días" y "Agenda de hoy" marcan las
  audiencias con un badge "Audiencia".
- **Verificado** (BD local, carmen.almonte): activar los 3 widgets → persisten y
  renderizan (estados vacíos correctos); badge "Audiencia" visible en Próximos 7
  días. typecheck ✓, build ✓. Sin migración nueva (próxima sigue `0035`).

### 2026-07-07 — Dashboard personalizable con widgets (migración `0034`)
- **Qué**: cada usuario personaliza su dashboard — mostrar/ocultar widgets y
  reordenarlos (botón "Personalizar" → diálogo con ↑/↓ + ojo). Se pidió también
  crear más widgets elegibles.
- **Modelo**: `users.preferences` jsonb (migración `0034_user_preferences`), guarda
  `{ dashboardWidgets: [{id, visible}] }` en el orden del usuario. Merge jsonb
  (`||`) al guardar para no pisar otras prefs.
- **Registry**: `lib/dashboard/widgets.ts` — lista TODOS los widgets (id, label,
  span, defaultVisible). `resolveDashboardLayout(prefs)` mezcla prefs+registry, así
  widgets nuevos aparecen solos para todos. `normalizeDashboardLayout` valida el
  input del cliente contra el registry (whitelist de ids).
- **UI**: `page.tsx` arma un mapa `nodes` (id→JSX, reusa KpiCard/AgingChart/etc.) y
  emite en orden del layout en una grilla de 12 col (`SPAN_CLASS`). Nuevo
  `dashboard-customize.tsx` (client, diálogo). Query `lib/db/queries/preferences.ts`
  + action `app/_actions/preferences/dashboard.ts`.
- **Widgets nuevos** (aparte de los existentes): `kpi_tareas` (KPI mis tareas) y
  `casos_recientes` (últimos casos abiertos) — ambos default ocultos, elegibles.
- **Verificado** (BD local, carmen.almonte): render por defecto 9 widgets con spans
  correctos; personalizar → activar 2 ocultos → guardar → persiste en
  `users.preferences` y re-render 11 widgets. typecheck ✓, build ✓.
- **Protocolo**: reclamé la tarea en "🚧 Trabajo en curso" y pusheé el reclamo ANTES
  de codear (commit `cc637d8`), para no chocar con la otra cuenta. Al terminar,
  liberé la fila. **Esto es lo que hay que hacer siempre.**

### 2026-07-02 — Expedientes vinculados + auto-migración en deploy (commit `fc691d2`)
- **Expedientes vinculados**: `cases.parent_case_id` (self-FK, máx 1 nivel) + `subcase_last_seq`
  (contador atómico → código `2026-CIV-014-01`). Migración `0032_subcases.sql`.
  Queries en `lib/db/queries/cases.ts` (`listCases` self-join, `getCaseById`
  devuelve `parent`+`subcases`, `createCase` deriva código y valida profundidad
  con `SubcaseError`, `softDeleteCase`→`has_subcases`, `restoreCase`→
  `parent_archived`). UI: tab "Expedientes vinculados" + `subcase-create-button.tsx` (wrapper
  client necesario por la frontera RSC dentro de TabsContent), badges en
  `casos/page.tsx` y `casos/archivados/page.tsx`, header con link al padre.
- **Infra de deploy**: `scripts/migrate-deploy.ts` + `vercel.json buildCommand`
  para auto-aplicar migraciones en cada deploy (antes eran manuales).
- **Vista previa de documentos**: ya la había implementado otra sesión en
  `origin/main` (`DocumentPreviewDrawer`), más completa que mi intento — descarté
  el mío para no pisarla. Quedó vivo su preview.
- **Verificado**: typecheck ✓, build ✓, cadena completa de migraciones 0000-0032
  aplica limpio ✓, 12/12 asserts de integración de expedientes vinculados ✓, deploy Ready y
  `app.ldplegal.com.do` respondiendo.
- **Pendiente**: dashboard personalizable con widgets (ver arriba).

### 2026-07-02 (tarde) — Fix vista previa + acceso por usuario + rediseño de documentos
- **Bug vista previa (click en el nombre)**: el trigger del nombre iba envuelto en
  `WithTooltip` dentro de `<SheetTrigger asChild>`. El `Slot` de Radix clona el
  hijo inmediato para inyectar el `onClick`, pero `WithTooltip` devuelve un
  `<Tooltip>` (sin nodo DOM que reenvíe props) → el click se perdía. Fix:
  `<button title="…">` directo en `document-row`, `document-global-row` y
  `folder-browser`. (commit `f11b5c0`)
- **Acceso por usuario + líder editable + visibilidad**: `caso-edit-drawer` ahora
  edita el **líder** (`leadLawyerId`) y el **acceso usuario-por-usuario**
  (checkboxes que pueblan `case_assignments`). Con `visibility='restricted'` solo
  esos usuarios (+ admins) ven el caso — lo hace cumplir la RLS
  (`cases_firm_visibility`, ver 0001). El líder siempre queda con acceso (lo
  fuerza `editarCasoAction`). La card "Equipo y acceso" del Resumen ahora lee
  `c.visibility` (antes estaba hardcodeada → no reflejaba el cambio). Se quitaron
  las líneas de "Horas" del recuadro de indicadores (queda "Gastos"). (`f11b5c0`)
- **Documentos — vistas + drop zone**: `FolderBrowser` (compartido por
  `/documentos` y el tab del caso) ahora tiene selector de vista tipo Finder/
  Explorer — **Íconos** (tiles cuadrados con nombre completo), **Lista**,
  **Compacta** — persistido en `localStorage` (`ldp-docs-view`). Nueva
  `UploadDropZone` al fondo: arrastrás archivos del escritorio y se suben a la
  carpeta actual (DnD nativo + `uploadFileDirect` presigned R2, barra de progreso).
  El DnD de `@dnd-kit` (mover docs existentes) sigue en Lista/Compacta. (`6f2259d`)
- **IA**: el error que veía Gabriel ("This organization has been disabled") es de
  **cuenta/facturación de Anthropic**, no de código. `friendlyAiError`
  (`lib/ai/claude.ts`) ya lo traduce a un mensaje legible que apunta a
  console.anthropic.com. Acción pendiente del lado del usuario: reactivar la org
  o poner una `ANTHROPIC_API_KEY` nueva en el server.
- **Expedientes vinculados**: verificados de forma estática (typecheck + `next build` OK; lógica
  de profundidad/código/archivar-restaurar de la sesión previa intacta). No se
  tocó el modelo; **no hay migración nueva** (próxima sigue siendo `0033`).
- **Sin migraciones**: todo usó tablas existentes (`leadLawyerId`, `visibility`,
  `case_assignments`).
- **Pendiente**: estética macOS más global (solo se aplicó en documentos/editar
  caso); dashboard personalizable con widgets.

### 2026-07-02 (noche) — Honorarios editables + fix sistémico de botones muertos + auditoría
- **Honorarios editables post-creación** (`7aa7c43`): antes los honorarios solo se
  definían al crear el caso y quedaban congelados. Ahora `HonorariosPanel` en el
  Resumen permite agregar/editar/eliminar (solo admin/partner). Nuevas queries
  `addCaseFee`/`updateCaseFee`/`deleteCaseFee` + actions
  `app/_actions/casos/honorarios.ts` con guard `hasAdminPowers`. El **modo de
  facturación** también pasó a ser editable en Editar caso.
- **Fix sistémico de botones muertos** (`257e661`): `WithTooltip` no era
  `forwardRef` ni reenviaba props → cualquier `<XTrigger asChild><WithTooltip>
  <button/></WithTooltip></XTrigger>` dejaba el botón MUERTO (el Slot de Radix no
  podía inyectar el onClick). Ahora `WithTooltip` es `forwardRef` y pasa
  `...rest`+`ref` al `TooltipTrigger`, componiendo hover+click. Esto revivió el
  botón **"Asistente IA"** del caso (usaba `SheetTrigger asChild`) y previene la
  recurrencia de esta clase de bug en toda la app. (`IconButton` ya lo hacía
  bien; el `ClienteFormDrawer` usa un wrapper `span onClick display:contents`,
  también OK.)
- **Auditoría inline** (el workflow multi-agente murió por límite de sesión de la
  cuenta): barrido de `href="#"`, `onClick={() => {}}`, stubs "próximamente",
  triggers rotos → **sin hallazgos** salvo el de WithTooltip. Configuración
  verificada como completa: NCF, datos del firm, branding, equipo (CRUD total de
  usuarios: crear/editar/rol/desactivar/reset password), tarifas por
  usuario/materia/cliente, plantillas, 2FA, integraciones, notificaciones,
  presupuesto IA. Ningún panel huérfano.
- **Pendiente de auditoría exhaustiva** (cuando resetee el límite de sesión):
  correr el workflow de 11 áreas (casos/documentos/clientes-portal/facturación/
  agenda/configuración/rutas/actions-wiring/hardcodes/misc) con verificación
  adversarial. Guardado en `.claude/.../workflows/scripts/audit-ldp-app-*.js`.

### 2026-07-03 — Honorarios editables, fecha en gestiones, IA legible, fix botones
- **Honorarios editables post-creación** (`7aa7c43`): `HonorariosPanel` en el
  Resumen (agregar/editar/eliminar, solo admin/partner) + queries `addCaseFee`/
  `updateCaseFee`/`deleteCaseFee` + `app/_actions/casos/honorarios.ts`. Modo de
  facturación también editable en Editar caso.
- **Fix sistémico de botones muertos** (`257e661`): `WithTooltip` ahora es
  `forwardRef` y reenvía props+ref → cualquier `<XTrigger asChild><WithTooltip>`
  compone bien (revivió "Asistente IA"). No revertir.
- **Fecha en gestiones** (`fd28889`, migración **0033_note_date**): las notas
  tienen `note_date` editable (la fecha de la gestión, distinta de created_at).
  Form con `<input type=date>`, orden por fecha, NoteCard la muestra. Backfill =
  created_at.
- **IA — errores legibles** (`fd28889`): `friendlyAiError` dejó de matchear
  "account" a secas (disfrazaba todo como "cuenta deshabilitada"). Ahora
  distingue org-deshabilitada / saldo insuficiente / key inválida / sin permiso
  de modelo / modelo inexistente / rate-limit / overload, y el fallback muestra
  HTTP status + extracto real. **El modelo default `claude-sonnet-4-6` es VÁLIDO
  (verificado con el catálogo oficial) — no era la causa.** Con billing OK, el
  error real más probable es falta de créditos cargados en console.anthropic.com.
- **Auditoría inline**: sin más botones muertos ni stubs; Configuración ya es
  completa (usuarios CRUD, tarifas, NCF, firma, branding, etc.). El workflow
  multi-agente de 11 áreas murió por límite de sesión de la cuenta — queda el
  script en `.claude/.../workflows/scripts/audit-ldp-app-*.js` para correrlo
  cuando resetee el límite (4:30am RD).
- **Pendiente**: estética macOS más global; dashboard con widgets; correr la
  auditoría exhaustiva multi-agente.

<!-- Próxima sesión: copiá este bloque como plantilla y añadí tu entrada ARRIBA de esta línea. -->
