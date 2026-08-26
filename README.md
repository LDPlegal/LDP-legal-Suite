# LDP Legal Suite — Fase 0

Sistema de gestión legal multi-tenant para firmas boutique en República
Dominicana. Inspiración funcional: Zaphyrus Legal de DTE Online,
reimaginado con UX y arquitectura de 2026.

> Esta es la **Fase 0**: bootstrap del producto, autenticación, layout
> shell, CRUD de Clientes y Casos, y **defensa en profundidad multi-tenant
> demostrada por test** (RLS de Postgres + helper aplicativo `withFirm`).
> Las fases 1-5 (timer, facturación, documentos, OCR, reportes, portal de
> cliente, IA) están deliberadamente fuera de alcance — ver
> [`DECISIONS.md`](./DECISIONS.md).

---

## Stack

- **Frontend:** Next.js 15 · React 19 · TypeScript estricto
  (`noUncheckedIndexedAccess`)
- **UI:** Tailwind v4 + shadcn/ui (Radix) + lucide-react
- **DB:** Postgres 16 + Drizzle ORM · Row Level Security activo
- **Auth:** better-auth (email + password) con sesión cookie httpOnly
- **Server Actions** para mutaciones · **Zod** en cada boundary
- **Tests:** Vitest (integración / RLS) + Playwright (E2E cross-tenant)

---

## Setup (Windows, sin Docker)

### 1. Pre-requisitos

- Node.js 20+ (probado con 24)
- pnpm (instálalo con `npm install -g pnpm` si no lo tienes)
- Postgres 16 instalado nativamente:
  - `winget install PostgreSQL.PostgreSQL.16` (PowerShell admin), o
  - Instalador oficial: <https://www.postgresql.org/download/windows/>
  - Durante el instalador, anota la contraseña del superuser `postgres`

### 2. Configurar `.env`

```bash
cp .env.example .env
```

Edita `.env` y reemplaza:

- `DATABASE_URL` — usuario `app_user` (este se crea automáticamente con
  `pnpm db:migrate`). Cambia la contraseña por una segura, no la default.
- `DATABASE_MIGRATE_URL` — usuario `postgres` con la contraseña que pusiste
  durante la instalación de Postgres.
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32` o equivalente.

### 3. Instalar dependencias y migrar DB

```bash
pnpm install
pnpm db:migrate    # crea DB + rol app_user (NOBYPASSRLS) + schema + RLS + grants
pnpm db:seed       # 2 firmas, 10 usuarios, 18 clientes, 26 casos (1 restringido por firma)
```

`pnpm db:migrate` es idempotente — re-ejecutarlo es seguro.

### 4. Levantar la app

```bash
pnpm dev
```

Abre <http://localhost:3000> y haz login con:

- `carmen.almonte@almontereyes.do` (admin de **Bufete Almonte & Reyes**) — password: `password123`
- `francisco.pichardo@pichardolegal.do` (admin de **Pichardo Legal Group**) — password: `password123`

---

## Self-hosting con Docker (opcional)

Si prefieres Docker en lugar de Postgres nativo:

```bash
docker compose up -d
# Ajusta DATABASE_URL/DATABASE_MIGRATE_URL en .env si las credenciales difieren
pnpm db:migrate && pnpm db:seed && pnpm dev
```

Ver [`docker-compose.yml`](./docker-compose.yml) para detalles.

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor Next.js en modo desarrollo |
| `pnpm build` | Build de producción |
| `pnpm start` | Sirve el build de producción |
| `pnpm lint` | ESLint sobre todo el proyecto |
| `pnpm typecheck` | `tsc --noEmit` (TS estricto) |
| `pnpm test` | Suite de Vitest (incluye `tests/integration/rls.test.ts`) |
| `pnpm test:e2e` | Suite de Playwright (incluye cross-tenant) |
| `pnpm db:generate` | Genera SQL desde el schema Drizzle — **NO usar a ciegas**, ver nota abajo |
| `pnpm db:migrate` | Bootstrap completo de DB (idempotente) |
| `pnpm db:seed` | Carga seeds dominicanos |
| `pnpm db:studio` | Abre Drizzle Studio |

---

## La prueba de fuego de Fase 0 — RLS cross-tenant

El test que justifica los pasos 4 y 5 del [BRIEF](./BRIEF%20final.md) es
[`tests/integration/rls.test.ts`](./tests/integration/rls.test.ts). Ataca
directamente la base de datos como `app_user` (BYPASSRLS = false) y verifica:

1. Sin contexto de firma (`app.firm_id` no seteado), las queries fallan ruidosamente.
2. Con contexto de firm A, solo los datos de firm A son visibles.
3. Un INSERT con `firm_id` ajeno es bloqueado por `WITH CHECK`.
4. Un caso con `visibility='restricted'` es invisible para un abogado
   no asignado del MISMO firm.
5. El admin del firm ve los casos restringidos (cláusula `users.role = 'admin'`).

```bash
pnpm test                         # Vitest
pnpm test:e2e                     # Playwright (E2E equivalente)
```

Si esos tests fallan, no avanzar a Fase 1.

---

## ⚠️ Migraciones se escriben a mano

**No usar `pnpm db:generate` de forma confiable.** Durante Fase 6
descubrimos que el journal de drizzle-kit estaba muy desactualizado
respecto al `schema.ts` (muchos cambios se hicieron manualmente sin
generar). Una llamada a `db:generate` produjo una migración de 40+
cambios mezclando lo nuevo con cosas ya aplicadas — peligrosa de correr
en producción.

**Patrón del proyecto:**
1. Editar `lib/db/schema.ts`.
2. Escribir a mano `drizzle/migrations/NNNN_descripcion.sql` con
   `IF NOT EXISTS` / `IF EXISTS` donde corresponda (idempotente).
3. Agregar entrada manual en `drizzle/migrations/meta/_journal.json`
   con el tag exacto del filename.
4. Correr `pnpm db:migrate` (que ejecuta lo nuevo del journal).

Ver `drizzle/migrations/0023_case_fees.sql` como ejemplo del estilo
(comentarios contextuales, RLS en la misma migración, idempotencia).

## Convenciones

- **Naming:** español para vocabulario de dominio visible al usuario
  (caso, expediente, factura, cliente). Inglés para identificadores de
  código (`Case`, `Invoice`). Schemas Drizzle en inglés. Tablas en snake_case.
- **Server Components por defecto.** `'use client'` solo donde hay estado
  o interactividad.
- **Toda query Drizzle pasa por `withFirm(firmId, userId, ...)`.** Sin
  excepciones (excepto el flujo de signup, ver [`DECISIONS.md`](./DECISIONS.md) E2).
- **Validación con Zod en CADA boundary** — server actions, parsing de
  formularios, parsing de URL params.
- **Timestamps en UTC** (`timestamptz`); render via `formatInFirmTz` con
  `firms.timezone`.
- **Commits convencionales** (`feat:`, `fix:`, `chore:`, `refactor:`).

---

## Estructura

```text
.
├── app/
│   ├── (auth)/                # /login, /signup
│   ├── (app)/                 # rutas autenticadas (sidebar + header)
│   │   ├── dashboard/
│   │   ├── casos/             # lista + detalle + drawer
│   │   ├── clientes/          # lista + detalle + drawer
│   │   └── [otros]/           # tiempos, tareas, calendario, ... (placeholders)
│   ├── _actions/              # Server Actions (auth/, clientes/, casos/, palette/)
│   ├── api/auth/[...all]/     # better-auth handler
│   ├── globals.css            # Tailwind v4 + tokens (paleta del § 4 del maestro)
│   └── layout.tsx
├── components/
│   ├── auth/                  # login + signup forms
│   ├── layout/                # sidebar, header, command-palette, theme-toggle, user-menu
│   └── ui/                    # shadcn primitives
├── lib/
│   ├── auth/                  # better-auth server, client, session helpers
│   ├── db/
│   │   ├── schema.ts          # Drizzle schema (firms, users, clients, cases, ...)
│   │   ├── client.ts          # runtime pool (app_user)
│   │   ├── admin.ts           # admin pool (postgres) — solo migrate/seed/auth
│   │   ├── with-firm.ts       # helper de RLS context
│   │   └── queries/           # patrones de queries por entidad
│   ├── schemas/               # Zod schemas (auth, cliente, caso)
│   └── datetime/              # formatInFirmTz, etc.
├── drizzle/migrations/
│   └── 0000_initial_with_rls.sql   # schema + RLS en MISMA migración
├── scripts/
│   ├── migrate.ts             # bootstrap idempotente
│   └── seed.ts                # 2 firmas + datos dominicanos
├── tests/
│   ├── integration/rls.test.ts        # prueba de fuego
│   └── e2e/cross-tenant.spec.ts       # E2E equivalente
├── DECISIONS.md               # las 7 decisiones del § 9 + excepciones
└── README.md                  # este archivo
```

---

## Punteros

- [BRIEF de ejecución](./BRIEF%20final.md) — los 11 pasos con verificaciones y trampas.
- [DECISIONS.md](./DECISIONS.md) — las 7 decisiones del § 9 implementadas + 5 excepciones documentadas.

---

## Estado

- [x] Pasos 1-11 del BRIEF completados.
- [x] Tests de RLS (Vitest) y cross-tenant (Playwright) escritos.
- [ ] **Pendiente del usuario:** instalar Postgres 16 nativamente, ajustar
      `.env`, correr `pnpm db:migrate && pnpm db:seed`, validar `pnpm test`
      en local.

Una vez que los 10 puntos del § 3 del BRIEF (verificación final) pasen,
Fase 0 está lista. **No avanzar a Fase 1 sin aprobación explícita.**
