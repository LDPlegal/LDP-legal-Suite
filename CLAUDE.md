# CLAUDE.md — LDP Legal Suite

> **LÉEME PRIMERO (para cualquier sesión de Claude, cualquier cuenta).**
> Este archivo es la fuente de verdad del estado del proyecto y el registro de
> traspaso entre sesiones. Antes de trabajar: **leé este archivo completo.**
> Al terminar: **añadí una entrada a la "Bitácora de sesiones" al final**
> (fecha, qué cambiaste, por qué, archivos/commits, qué queda pendiente).
> Así cualquier cuenta que retome el proyecto sabe qué pasó sin adivinar.

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
   **Próxima migración: `0033`** (la última es `0032_subcases`).
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

- ✅ **Subcasos (casos hijos)** — un caso puede contener subcasos (`parent_case_id`,
  código derivado `PADRE-NN`). Tab "Subcasos" en el detalle, badges en listas,
  guards de archivar/restaurar. Migración `0032`. **En producción.**
- ✅ **Vista previa de documentos** — clic en el nombre abre preview
  (`DocumentPreviewDrawer`), con menú de acciones ⋮, carpetas y docs privados.
  **En producción.**
- ⏭️ **Dashboard personalizable con widgets** — PENDIENTE. Cada usuario elegiría
  qué widgets ver y se crearían más widgets funcionales. No existe tabla de
  preferencias por-usuario todavía (habría que agregar `users.preferences` jsonb
  o una tabla `user_dashboard_widgets`). El dashboard actual está en
  `app/(app)/dashboard/page.tsx` (cards inline, sin personalización).

## Protocolo de traspaso entre sesiones/cuentas

1. Al empezar: `git pull`, leé este archivo y revisá `git log` reciente.
2. Al terminar cualquier trabajo: **añadí una entrada abajo** en "Bitácora de
   sesiones" y commiteala junto con tu cambio. Mantené el formato.
3. Commits: mensajes descriptivos (qué y por qué). No commitees `sitefinal/`,
   `.env`, ni `.vercel/`.

---

## Bitácora de sesiones

### 2026-07-02 — Subcasos + auto-migración en deploy (commit `fc691d2`)
- **Subcasos**: `cases.parent_case_id` (self-FK, máx 1 nivel) + `subcase_last_seq`
  (contador atómico → código `2026-CIV-014-01`). Migración `0032_subcases.sql`.
  Queries en `lib/db/queries/cases.ts` (`listCases` self-join, `getCaseById`
  devuelve `parent`+`subcases`, `createCase` deriva código y valida profundidad
  con `SubcaseError`, `softDeleteCase`→`has_subcases`, `restoreCase`→
  `parent_archived`). UI: tab "Subcasos" + `subcase-create-button.tsx` (wrapper
  client necesario por la frontera RSC dentro de TabsContent), badges en
  `casos/page.tsx` y `casos/archivados/page.tsx`, header con link al padre.
- **Infra de deploy**: `scripts/migrate-deploy.ts` + `vercel.json buildCommand`
  para auto-aplicar migraciones en cada deploy (antes eran manuales).
- **Vista previa de documentos**: ya la había implementado otra sesión en
  `origin/main` (`DocumentPreviewDrawer`), más completa que mi intento — descarté
  el mío para no pisarla. Quedó vivo su preview.
- **Verificado**: typecheck ✓, build ✓, cadena completa de migraciones 0000-0032
  aplica limpio ✓, 12/12 asserts de integración de subcasos ✓, deploy Ready y
  `app.ldplegal.com.do` respondiendo.
- **Pendiente**: dashboard personalizable con widgets (ver arriba).

<!-- Próxima sesión: copiá este bloque como plantilla y añadí tu entrada ARRIBA de esta línea. -->
