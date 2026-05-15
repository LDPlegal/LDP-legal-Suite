import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// =============================================================================
// Enums
// =============================================================================

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "partner",
  "lawyer",
  "paralegal",
  "tester",
  "client",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "invited",
  "suspended",
]);

export const clientTypeEnum = pgEnum("client_type", ["individual", "corporate"]);

export const taxIdTypeEnum = pgEnum("tax_id_type", [
  "rnc",
  "cedula",
  "passport",
  "other",
]);

export const clientStatusEnum = pgEnum("client_status", [
  "active",
  "prospect",
  "closed",
]);

export const matterTypeEnum = pgEnum("matter_type", [
  "civil",
  "corporate",
  "real_estate",
  "criminal",
  "labor",
  "tax",
  "administrative",
  "other",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "open",
  "on_hold",
  "closed",
]);

export const billingModeEnum = pgEnum("billing_mode", [
  "hourly",
  "flat_fee",
  "retainer",
  "contingency",
]);

export const caseVisibilityEnum = pgEnum("case_visibility", [
  "firm",
  "restricted",
]);

export const caseAssignmentRoleEnum = pgEnum("case_assignment_role", [
  "lead",
  "associate",
  "paralegal",
]);

// =============================================================================
// firms — root tenant entity
// =============================================================================

export const firms = pgTable(
  "firms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    rnc: text("rnc"),
    address: text("address"),
    logoUrl: text("logo_url"),
    timezone: text("timezone").notNull().default("America/Santo_Domingo"),
    defaultCurrency: text("default_currency").notNull().default("DOP"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("firms_rnc_unique").on(t.rnc).where(sql`${t.rnc} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
);

// =============================================================================
// users — domain users + better-auth user mapping
// =============================================================================
// Naming note: better-auth defaults to a "user" table; we configure better-auth
// to use our domain "users" table via the modelName option. password_hash lives
// in `accounts` (better-auth credential provider), not here.
// =============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("lawyer"),
    hourlyRate: decimal("hourly_rate", { precision: 12, scale: 2 }),
    image: text("image"), // avatar (better-auth uses `image` by convention)
    // iCal subscription token (Fase 4.3) — opaque random string used by
    // Outlook/Google to subscribe to /api/calendario/feed/<token>.ics. Null
    // until the user opts in; can be rotated with regenerate.
    icalToken: text("ical_token"),
    // For role='client' (Portal Cliente, Fase 4): the client this user can
    // see. NULL for staff roles. Server-side helpers enforce that
    // role='client' rows have a non-null client_id, and the portal layout
    // refuses to render for any other role.
    //
    // The foreign key constraint to clients(id) ON DELETE CASCADE is declared
    // in migration 0007_portal_cliente.sql, NOT via Drizzle's .references().
    // Declaring it here would create a circular type reference
    // (clients.created_by -> users.id, users.client_id -> clients.id) that
    // breaks TypeScript inference for both tables. DB behaviour is identical;
    // only Drizzle's relation graph doesn't model it.
    clientId: uuid("client_id"),
    status: userStatusEnum("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("users_firm_id_idx").on(t.firmId),
    // Compound unique (firm_id, email) — same email may exist across firms,
    // partial on deleted_at IS NULL so soft-deleted users free their email.
    uniqueIndex("users_firm_email_unique")
      .on(t.firmId, t.email)
      .where(sql`${t.deletedAt} IS NULL`),
    // Lookup index for better-auth signin by email alone (signin currently
    // assumes globally-unique email; seed data is curated to not conflict).
    index("users_email_idx").on(t.email),
    index("users_firm_client_idx").on(t.firmId, t.clientId),
    uniqueIndex("users_ical_token_unique")
      .on(t.icalToken)
      .where(sql`${t.icalToken} IS NOT NULL`),
  ],
);

// =============================================================================
// better-auth auxiliary tables: sessions, accounts, verifications
// =============================================================================
// These are managed by better-auth. They reference `users.id` but have no
// `firm_id` of their own — RLS for these tables joins via users (see RLS
// migration). Only better-auth touches them; never query directly from
// domain code. better-auth uses the admin connection (DATABASE_MIGRATE_URL)
// to bypass RLS during signin/signup, which is documented in DECISIONS.md.
// =============================================================================

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// clients
// =============================================================================

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    type: clientTypeEnum("type").notNull(),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    taxIdType: taxIdTypeEnum("tax_id_type"),
    taxId: text("tax_id"),
    primaryContactName: text("primary_contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    billingAddress: text("billing_address"),
    notes: jsonb("notes").$type<Record<string, unknown>>(), // richtext json (Tiptap)
    status: clientStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("clients_firm_id_idx").on(t.firmId),
    index("clients_firm_status_idx").on(t.firmId, t.status),
    index("clients_firm_tax_id_idx").on(t.firmId, t.taxId),
  ],
);

// =============================================================================
// cases (expedientes)
// =============================================================================

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g. "2026-CIV-014"
    title: text("title").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    matterType: matterTypeEnum("matter_type").notNull(),
    description: text("description"),
    status: caseStatusEnum("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    leadLawyerId: uuid("lead_lawyer_id").references(() => users.id, { onDelete: "set null" }),
    billingMode: billingModeEnum("billing_mode").notNull().default("hourly"),
    flatFeeAmount: decimal("flat_fee_amount", { precision: 14, scale: 2 }),
    retainerBalance: decimal("retainer_balance", { precision: 14, scale: 2 }),
    court: text("court"),
    counterpartyName: text("counterparty_name"),
    counterpartyTaxId: text("counterparty_tax_id"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    visibility: caseVisibilityEnum("visibility").notNull().default("firm"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("cases_firm_id_idx").on(t.firmId),
    uniqueIndex("cases_firm_code_unique")
      .on(t.firmId, t.code)
      .where(sql`${t.deletedAt} IS NULL`),
    index("cases_firm_client_idx").on(t.firmId, t.clientId),
    index("cases_firm_status_idx").on(t.firmId, t.status),
    index("cases_firm_lead_idx").on(t.firmId, t.leadLawyerId),
    // Conflict-check support (§ 9.6) — UI ships in Fase 4, but the index is
    // here from day 1 so historical data is queryable when that ships.
    index("cases_firm_counterparty_tax_idx").on(t.firmId, t.counterpartyTaxId),
  ],
);

// =============================================================================
// case_assignments — source of truth for case-level authorization (§ 9.2)
// =============================================================================

export const caseAssignments = pgTable(
  "case_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleInCase: caseAssignmentRoleEnum("role_in_case").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("case_assignments_case_user_unique").on(t.caseId, t.userId),
    index("case_assignments_user_idx").on(t.userId),
  ],
);

// =============================================================================
// case_counters — race-safe sequential generator for case codes (Trampa #7)
// =============================================================================
// Atomic INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING last_seq is the
// pattern that makes code generation safe under concurrent inserts.
// =============================================================================

export const caseCounters = pgTable(
  "case_counters",
  {
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    matterType: matterTypeEnum("matter_type").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("case_counters_pk").on(t.firmId, t.year, t.matterType),
  ],
);

// =============================================================================
// Relations
// =============================================================================

export const firmsRelations = relations(firms, ({ many }) => ({
  users: many(users),
  clients: many(clients),
  cases: many(cases),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  firm: one(firms, {
    fields: [users.firmId],
    references: [firms.id],
  }),
  caseAssignments: many(caseAssignments),
  ledCases: many(cases, { relationName: "lead_lawyer" }),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  firm: one(firms, {
    fields: [clients.firmId],
    references: [firms.id],
  }),
  createdBy: one(users, {
    fields: [clients.createdBy],
    references: [users.id],
  }),
  cases: many(cases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  firm: one(firms, {
    fields: [cases.firmId],
    references: [firms.id],
  }),
  client: one(clients, {
    fields: [cases.clientId],
    references: [clients.id],
  }),
  leadLawyer: one(users, {
    fields: [cases.leadLawyerId],
    references: [users.id],
    relationName: "lead_lawyer",
  }),
  assignments: many(caseAssignments),
}));

export const caseAssignmentsRelations = relations(caseAssignments, ({ one }) => ({
  case: one(cases, {
    fields: [caseAssignments.caseId],
    references: [cases.id],
  }),
  user: one(users, {
    fields: [caseAssignments.userId],
    references: [users.id],
  }),
}));

// =============================================================================
// Inferred types — use these in app code, not raw inserts.
// =============================================================================

export type Firm = typeof firms.$inferSelect;
export type NewFirm = typeof firms.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

export type CaseAssignment = typeof caseAssignments.$inferSelect;
export type NewCaseAssignment = typeof caseAssignments.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;

// =============================================================================
// FASE 1 — Tiempos · Tareas · Calendario · Gastos
// =============================================================================

// ----- Enums ---------------------------------------------------------------

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "med",
  "high",
  "urgent",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "waiting",
  "done",
]);

export const timeEntryStatusEnum = pgEnum("time_entry_status", [
  "draft",
  "approved",
  "invoiced",
]);

export const expenseStatusEnum = pgEnum("expense_status", [
  "draft",
  "approved",
  "invoiced",
]);

// =============================================================================
// active_timers — server-side persistent timer (§ 9.4)
// =============================================================================
// One timer max per user (PK on user_id). Heartbeat updates last_heartbeat_at;
// if it falls > 15min behind we treat the timer as stale and offer the user
// to recover or discard. Opening a new tab queries this table — same timer
// appears, no duplication.
// =============================================================================

export const activeTimers = pgTable(
  "active_timers",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    description: text("description"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("active_timers_firm_idx").on(t.firmId),
    index("active_timers_case_idx").on(t.caseId),
  ],
);

// =============================================================================
// time_entries — billable / non-billable time logged against a case
// =============================================================================
// duration_seconds is computed at write time from started_at / ended_at and
// stored explicitly so reports don't recompute on every read.
// hourly_rate_snapshot freezes the rate at billing time; if the user's rate
// changes later, already-approved entries don't re-price.
// invoice_id is uuid (no FK yet) — Fase 2 will add the FK to invoices table.
// =============================================================================

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    billable: boolean("billable").notNull().default(true),
    hourlyRateSnapshot: decimal("hourly_rate_snapshot", { precision: 12, scale: 2 }),
    status: timeEntryStatusEnum("status").notNull().default("draft"),
    invoiceId: uuid("invoice_id"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("time_entries_firm_idx").on(t.firmId),
    index("time_entries_firm_case_idx").on(t.firmId, t.caseId),
    index("time_entries_firm_user_idx").on(t.firmId, t.userId),
    index("time_entries_firm_status_idx").on(t.firmId, t.status),
    index("time_entries_started_idx").on(t.firmId, t.startedAt),
  ],
);

// =============================================================================
// tasks — case-scoped or firm-wide
// =============================================================================
// case_id is nullable: a task with case_id NULL is a firm-wide task (e.g.,
// internal admin work). When case_id is set, RLS enforces inheritance of the
// case's visibility (restricted cases hide their tasks too).
// =============================================================================

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: taskPriorityEnum("priority").notNull().default("med"),
    status: taskStatusEnum("status").notNull().default("todo"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_firm_idx").on(t.firmId),
    index("tasks_firm_case_idx").on(t.firmId, t.caseId),
    index("tasks_firm_assignee_idx").on(t.firmId, t.assigneeId),
    index("tasks_firm_status_idx").on(t.firmId, t.status),
    index("tasks_firm_due_idx").on(t.firmId, t.dueAt),
  ],
);

// =============================================================================
// events — calendar entries
// =============================================================================
// Like tasks, case_id is nullable for firm-wide events. attendees is an
// array of user_ids; when a user is in attendees we surface the event in
// their personal feed. ical_uid is the UID for .ics export — generated on
// create and immutable so re-exports stay stable for external calendars.
// =============================================================================

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    // Stored as text[] so the JS string[] of UUIDs round-trips cleanly through
    // node-postgres / drizzle. With uuid[] drizzle serialised a single-element
    // array as a bare uuid which Postgres rejected ("malformed array literal").
    // Validation that values are real UUIDs lives in the Zod schema layer.
    attendees: text("attendees").array().notNull().default(sql`ARRAY[]::text[]`),
    reminderMinutes: integer("reminder_minutes"),
    icalUid: text("ical_uid").notNull(),
    // iCal bidireccional (Fase 4.3): when this event was imported from an
    // external subscription, externalSubscriptionId points to the source and
    // externalUid is the UID emitted by the external calendar (used to dedupe
    // re-imports). Both NULL for events created inside the app.
    externalSubscriptionId: uuid("external_subscription_id"),
    externalUid: text("external_uid"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("events_firm_idx").on(t.firmId),
    index("events_firm_case_idx").on(t.firmId, t.caseId),
    index("events_firm_start_idx").on(t.firmId, t.startAt),
    uniqueIndex("events_ical_uid_unique").on(t.icalUid),
    // Dedupe key for re-imports: each (subscription, externalUid) maps to
    // exactly one event row. Insert-on-conflict keeps the import idempotent.
    uniqueIndex("events_external_unique")
      .on(t.externalSubscriptionId, t.externalUid)
      .where(sql`${t.externalSubscriptionId} IS NOT NULL AND ${t.externalUid} IS NOT NULL`),
  ],
);

// =============================================================================
// external_calendar_subscriptions — iCal feeds the user wants to ingest
// =============================================================================
// User pastes an .ics URL (Outlook share / Google calendar URL / a colleague's
// LDP feed); on demand or on schedule we fetch and upsert into events with
// externalSubscriptionId set. Soft-deleted on disconnect.

export const externalCalendarSubscriptions = pgTable(
  "external_calendar_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    active: boolean("active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastEventCount: integer("last_event_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("external_cal_firm_user_idx").on(t.firmId, t.userId),
  ],
);

export type ExternalCalendarSubscription = typeof externalCalendarSubscriptions.$inferSelect;

// =============================================================================
// expenses — case expenses (always case-scoped per maestro)
// =============================================================================
// receipt_url is just text in Fase 1 (no upload UI yet — Fase 2). currency
// defaults to firm.default_currency at create time but stored explicitly so
// historical reports stay correct if firm currency changes.
// =============================================================================

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("DOP"),
    incurredOn: timestamp("incurred_on", { withTimezone: true }).notNull(),
    billable: boolean("billable").notNull().default(true),
    receiptUrl: text("receipt_url"),
    status: expenseStatusEnum("status").notNull().default("draft"),
    invoiceId: uuid("invoice_id"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("expenses_firm_idx").on(t.firmId),
    index("expenses_firm_case_idx").on(t.firmId, t.caseId),
    index("expenses_firm_user_idx").on(t.firmId, t.userId),
    index("expenses_firm_status_idx").on(t.firmId, t.status),
    index("expenses_incurred_idx").on(t.firmId, t.incurredOn),
  ],
);

// ----- Relations (Fase 1) ---------------------------------------------------

export const activeTimersRelations = relations(activeTimers, ({ one }) => ({
  user: one(users, { fields: [activeTimers.userId], references: [users.id] }),
  firm: one(firms, { fields: [activeTimers.firmId], references: [firms.id] }),
  case: one(cases, { fields: [activeTimers.caseId], references: [cases.id] }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  firm: one(firms, { fields: [timeEntries.firmId], references: [firms.id] }),
  case: one(cases, { fields: [timeEntries.caseId], references: [cases.id] }),
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
  approvedBy: one(users, {
    fields: [timeEntries.approvedById],
    references: [users.id],
    relationName: "time_entry_approver",
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  firm: one(firms, { fields: [tasks.firmId], references: [firms.id] }),
  case: one(cases, { fields: [tasks.caseId], references: [cases.id] }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "task_assignee",
  }),
  createdBy: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: "task_creator",
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  firm: one(firms, { fields: [events.firmId], references: [firms.id] }),
  case: one(cases, { fields: [events.caseId], references: [cases.id] }),
  createdBy: one(users, {
    fields: [events.createdBy],
    references: [users.id],
    relationName: "event_creator",
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  firm: one(firms, { fields: [expenses.firmId], references: [firms.id] }),
  case: one(cases, { fields: [expenses.caseId], references: [cases.id] }),
  user: one(users, { fields: [expenses.userId], references: [users.id] }),
  approvedBy: one(users, {
    fields: [expenses.approvedById],
    references: [users.id],
    relationName: "expense_approver",
  }),
}));

// ----- Inferred types (Fase 1) ---------------------------------------------

export type ActiveTimer = typeof activeTimers.$inferSelect;
export type NewActiveTimer = typeof activeTimers.$inferInsert;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

// =============================================================================
// FASE 2 — Documentos · Notas · Facturación · OCR
// =============================================================================

// ----- Enums F2 -------------------------------------------------------------

export const documentOcrStatusEnum = pgEnum("document_ocr_status", [
  "pending", // queued, not processed yet
  "processing", // worker is running OCR
  "done", // ocr_text is populated
  "failed", // OCR failed (network, parsing, etc.)
  "skipped", // file too large or non-OCRable mime type — see DECISIONS.md F2
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
]);

// NCF / e-CF types per DGII (RD). § 9.3 of the maestro.
//   B01 — comprobante de crédito fiscal (paper)
//   B02 — comprobante de consumidor final (paper)
//   E31 — e-CF crédito fiscal (electrónico)
//   E32 — e-CF consumidor final (electrónico)
export const ncfTypeEnum = pgEnum("ncf_type", ["B01", "B02", "E31", "E32"]);

export const invoiceItemSourceEnum = pgEnum("invoice_item_source", [
  "time_entry",
  "expense",
  "manual",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "transfer",
  "check",
  "card",
  "other",
]);

// =============================================================================
// documents — files attached to a case (or client, or firm-wide)
// =============================================================================
// version + parent_document_id form a simple version chain: uploading a new
// version of a file points to its parent. v1 has parent NULL. There is no
// diff yet — that's a Fase 3 enhancement.
// ocr_text is filled by the OCR worker; until then it's NULL and ocr_status
// reflects the state. Search joins `documents.ocr_text` once it's populated.
// =============================================================================

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    ocrText: text("ocr_text"),
    ocrStatus: documentOcrStatusEnum("ocr_status").notNull().default("pending"),
    // Portal Cliente (Fase 4): when true, this document is visible to the
    // client in /portal/documentos. Default false — internal docs (drafts,
    // working notes, lawyer-prep material) stay hidden until explicitly
    // shared by an admin/partner/lawyer.
    sharedWithClient: boolean("shared_with_client").notNull().default(false),
    version: integer("version").notNull().default(1),
    parentDocumentId: uuid("parent_document_id"),
    // Idempotency key for the scan-ingest worker. When set, a unique index
    // on (firm_id, scan_id) ensures retries don't create duplicate rows.
    // NULL for documents uploaded through the regular UI.
    scanId: text("scan_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_firm_idx").on(t.firmId),
    index("documents_firm_case_idx").on(t.firmId, t.caseId),
    index("documents_firm_client_idx").on(t.firmId, t.clientId),
    index("documents_parent_idx").on(t.parentDocumentId),
    uniqueIndex("documents_firm_scan_id_unique")
      .on(t.firmId, t.scanId)
      .where(sql`${t.scanId} IS NOT NULL`),
  ],
);

// =============================================================================
// rate_limits — sliding-window rate limiting for API endpoints (Fase 6+)
// =============================================================================
// Single-row-per-key tracking. checkRateLimit() upserts atomically, resetting
// the window when expired. Keys are app-defined strings like
// "scan-ingest:resolve-user:203.0.113.5".
//
// Why SQL instead of Redis: avoids a second piece of infra. For < 10 req/s
// per endpoint this is fine; if traffic grows, swap to Upstash with the same
// helper interface.

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export type RateLimit = typeof rateLimits.$inferSelect;

// =============================================================================
// notes — Tiptap richtext per case (jsonb document model)
// =============================================================================

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("notes_firm_idx").on(t.firmId),
    index("notes_firm_case_idx").on(t.firmId, t.caseId),
    index("notes_firm_updated_idx").on(t.firmId, t.updatedAt),
  ],
);

// =============================================================================
// invoices + invoice_items + payments + invoice_counters
// =============================================================================
// Invoice number is INV-YYYY-NNN auto-generated per firm + year via
// invoice_counters (atomic UPSERT pattern, same race-safe approach as
// case_counters from Fase 0). NCF is optional (modo interno) and a separate
// counter per (firm, ncf_type) handles fiscal mode in DECISIONS.md F2.
// =============================================================================

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    number: text("number").notNull(), // e.g. "INV-2026-001"
    ncf: text("ncf"), // null in modo interno; populated in modo fiscal
    ncfType: ncfTypeEnum("ncf_type"),
    issuedOn: timestamp("issued_on", { withTimezone: true }).notNull(),
    dueOn: timestamp("due_on", { withTimezone: true }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    subtotal: decimal("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    itbisAmount: decimal("itbis_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    isrWithholdingAmount: decimal("isr_withholding_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    itbisWithholdingAmount: decimal("itbis_withholding_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    total: decimal("total", { precision: 14, scale: 2 }).notNull().default("0"),
    balance: decimal("balance", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("DOP"),
    notes: text("notes"),
    terms: text("terms"),
    pdfStorageKey: text("pdf_storage_key"), // points to a generated PDF in storage
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("invoices_firm_idx").on(t.firmId),
    uniqueIndex("invoices_firm_number_unique")
      .on(t.firmId, t.number)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("invoices_firm_ncf_unique")
      .on(t.firmId, t.ncf)
      .where(sql`${t.ncf} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index("invoices_firm_client_idx").on(t.firmId, t.clientId),
    index("invoices_firm_status_idx").on(t.firmId, t.status),
    index("invoices_firm_issued_idx").on(t.firmId, t.issuedOn),
    index("invoices_firm_due_idx").on(t.firmId, t.dueOn),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sourceType: invoiceItemSourceEnum("source_type").notNull(),
    sourceId: uuid("source_id"), // optional FK to time_entries.id or expenses.id (no DB FK; depends on source_type)
    description: text("description").notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull().default("1"),
    unitPrice: decimal("unit_price", { precision: 14, scale: 2 }).notNull(),
    taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).notNull().default("0.18"), // 18% ITBIS by default
    taxAmount: decimal("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("invoice_items_invoice_idx").on(t.invoiceId),
    index("invoice_items_source_idx").on(t.sourceType, t.sourceId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_paid_on_idx").on(t.paidOn),
  ],
);

// invoice_counters — atomic per (firm_id, year) for INV-YYYY-NNN. Same race-safe
// pattern as case_counters from Fase 0.
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoice_counters_pk").on(t.firmId, t.year)],
);

// ncf_counters — separate counter per (firm_id, ncf_type) for fiscal mode.
// In modo interno this stays empty. Documented in DECISIONS.md F2.3.
export const ncfCounters = pgTable(
  "ncf_counters",
  {
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    ncfType: ncfTypeEnum("ncf_type").notNull(),
    rangeStart: integer("range_start").notNull(),
    rangeEnd: integer("range_end").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
    expiresOn: timestamp("expires_on", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ncf_counters_pk").on(t.firmId, t.ncfType)],
);

// ----- Relations F2 ---------------------------------------------------------

export const documentsRelations = relations(documents, ({ one }) => ({
  firm: one(firms, { fields: [documents.firmId], references: [firms.id] }),
  case: one(cases, { fields: [documents.caseId], references: [cases.id] }),
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  uploadedBy: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
    relationName: "document_uploader",
  }),
  parent: one(documents, {
    fields: [documents.parentDocumentId],
    references: [documents.id],
    relationName: "document_versions",
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  firm: one(firms, { fields: [notes.firmId], references: [firms.id] }),
  case: one(cases, { fields: [notes.caseId], references: [cases.id] }),
  author: one(users, {
    fields: [notes.authorId],
    references: [users.id],
    relationName: "note_author",
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  firm: one(firms, { fields: [invoices.firmId], references: [firms.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  case: one(cases, { fields: [invoices.caseId], references: [cases.id] }),
  createdBy: one(users, {
    fields: [invoices.createdBy],
    references: [users.id],
    relationName: "invoice_creator",
  }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  createdBy: one(users, {
    fields: [payments.createdBy],
    references: [users.id],
    relationName: "payment_creator",
  }),
}));

// ----- Inferred types F2 ----------------------------------------------------

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// =============================================================================
// FASE 3 — Bitácora (audit_log)
// =============================================================================
// Cada cambio relevante (crear/editar/eliminar/aprobar/enviar/pagar/anular/
// subir/iniciar-timer/detener-timer) se registra para auditoría. Usado por:
//   * la pestaña Bitácora del detalle de cada entidad,
//   * la página /reportes (feed reciente del firm),
//   * verificación post-incidente cuando se necesita reconstruir qué pasó.
// El campo `diff` guarda un objeto libre (campos cambiados o snapshot mínimo).
// =============================================================================

export const auditActionEnum = pgEnum("audit_action", [
  "created",
  "updated",
  "deleted",
  "approved",
  "sent",
  "paid",
  "voided",
  "uploaded",
  "timer_started",
  "timer_stopped",
  "ncf_assigned",
]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    // Optional correlation: when an entity belongs to a case (invoice / time
    // entry / expense / document / note attached to a case), set caseId so
    // the case detail's Bitácora tab can list all related events together,
    // not just events whose entity_type is exactly 'case'.
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    action: auditActionEnum("action").notNull(),
    summary: text("summary"),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_firm_idx").on(t.firmId),
    index("audit_firm_entity_idx").on(t.firmId, t.entityType, t.entityId),
    index("audit_firm_case_idx").on(t.firmId, t.caseId),
    index("audit_firm_user_idx").on(t.firmId, t.userId),
    index("audit_firm_created_idx").on(t.firmId, t.createdAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  firm: one(firms, { fields: [auditLog.firmId], references: [firms.id] }),
  user: one(users, { fields: [auditLog.userId], references: [users.id] }),
}));

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// =============================================================================
// matter_templates — plantillas para autopoblar tareas/eventos al crear un caso
// =============================================================================
// Each row is a "type of case" preset. When a partner creates a case and picks
// a template, we copy the entries in defaultTasks/defaultEvents into the
// corresponding tables, with offsetDays added to today() for due dates.

export const matterTemplates = pgTable(
  "matter_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    matterType: matterTypeEnum("matter_type").notNull(),
    description: text("description"),
    // Each item: { title, description?, priority?, offsetDays? }
    defaultTasks: jsonb("default_tasks")
      .$type<
        Array<{
          title: string;
          description?: string;
          priority?: "low" | "med" | "high" | "urgent";
          offsetDays?: number;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Each item: { title, description?, location?, offsetDays, durationMinutes? }
    defaultEvents: jsonb("default_events")
      .$type<
        Array<{
          title: string;
          description?: string;
          location?: string;
          offsetDays: number;
          durationMinutes?: number;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("matter_tpl_firm_idx").on(t.firmId),
    index("matter_tpl_firm_type_idx").on(t.firmId, t.matterType),
  ],
);

export type MatterTemplate = typeof matterTemplates.$inferSelect;
export type NewMatterTemplate = typeof matterTemplates.$inferInsert;

// =============================================================================
// rates — tarifas con override por user / matter / cliente
// =============================================================================
// Lookup precedence (most specific wins):
//   1. (user, client)
//   2. (user, matter)
//   3. (user)
//   4. fallback to users.hourly_rate
// All NULL means "applies to anyone in this firm" — a firm-wide default.
// validFrom/validTo carve historical periods so old time entries keep their
// rate even when current rates change.

export const rates = pgTable(
  "rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    matterType: matterTypeEnum("matter_type"),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    hourlyRate: decimal("hourly_rate", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("DOP"),
    notes: text("notes"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("rates_firm_idx").on(t.firmId),
    index("rates_firm_user_idx").on(t.firmId, t.userId),
    index("rates_firm_matter_idx").on(t.firmId, t.matterType),
    index("rates_firm_client_idx").on(t.firmId, t.clientId),
  ],
);

export type Rate = typeof rates.$inferSelect;
export type NewRate = typeof rates.$inferInsert;

// =============================================================================
// ai_usage — cost tracking of every Claude call (Fase 6)
// =============================================================================
// One row per LLM request. We persist input/output tokens so the admin can
// see consumption breakdown by feature and by user in /reportes. Cost is
// best-effort (uses the rate snapshot at the time of the call); when prices
// change the historical rows keep the old cost.

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: text("feature")
      .$type<
        | "case_summary"
        | "refine_note"
        | "doc_search"
        | "doc_summary"
        | "chat"
        | "scan_classify"
        | "matter_chat"
        | "matter_context"
        | "doc_generate"
        | "event_parse"
      >()
      .notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    // USD cost computed at call-time using current model pricing.
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_firm_idx").on(t.firmId),
    index("ai_usage_firm_created_idx").on(t.firmId, t.createdAt),
    index("ai_usage_firm_user_idx").on(t.firmId, t.userId),
    index("ai_usage_firm_feature_idx").on(t.firmId, t.feature),
  ],
);

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;

// =============================================================================
// notifications — in-app inbox per user (Fase 6)
// =============================================================================

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notif_firm_user_idx").on(t.firmId, t.userId),
    index("notif_firm_user_unread_idx").on(t.firmId, t.userId, t.readAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// =============================================================================
// matter_chats — per-case persistent chat history (F7 — Gabriel spec)
// =============================================================================
// Each row is one message in the chat panel inside /casos/[id]. Messages
// persist across users + sessions so when Marc opens the chat today he sees
// what Gabriel wrote yesterday. The IA reads the full thread + the matter
// context to answer.
//
// `role` mirrors Anthropic Messages API: user / assistant. We don't store
// system messages here (the system prompt is built from matter_context + skills
// at request time). `toolCalls` holds the JSON of any tool_use / tool_result
// blocks for replay; the human-readable content lives in `content`.

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system"]);

export const matterChats = pgTable(
  "matter_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    // Anthropic tool_use / tool_result blocks attached to this message,
    // when the assistant called a tool. Stored verbatim for replay.
    toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>(),
    // Token usage of THIS message (input is the message itself when role=user,
    // not the cumulative context). Output tokens populated for role=assistant.
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheCreationTokens: integer("cache_creation_tokens"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("matter_chats_firm_case_idx").on(t.firmId, t.caseId),
    index("matter_chats_firm_case_created_idx").on(t.firmId, t.caseId, t.createdAt),
  ],
);

export type MatterChat = typeof matterChats.$inferSelect;
export type NewMatterChat = typeof matterChats.$inferInsert;

// =============================================================================
// matter_contexts — incremental narrative summary per case (cost optimization)
// =============================================================================
// Instead of sending the 47 documents + events + notes + timesheet of a case
// in every chat request, we maintain a narrative summary that the LLM
// updates incrementally. The chat tool reads docs on demand via tool_use
// when it actually needs the full content of one.
//
// One row per case (unique). Updated by a background job when the matter
// changes (new doc uploaded, new event, etc.) — debounced.

export const matterContexts = pgTable(
  "matter_contexts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" })
      .unique(),
    summary: text("summary").notNull().default(""),
    // Quick stats shown in the chat header ("La IA conoce: 47 docs, 3 partes,
    // 8 actuaciones previas, última actividad hace 12 días").
    stats: jsonb("stats")
      .$type<{
        docCount?: number;
        eventCount?: number;
        noteCount?: number;
        timeEntryCount?: number;
        lastActivityAt?: string;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    tokenCount: integer("token_count").notNull().default(0),
    needsRefresh: boolean("needs_refresh").notNull().default(true),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("matter_contexts_firm_idx").on(t.firmId)],
);

export type MatterContext = typeof matterContexts.$inferSelect;
