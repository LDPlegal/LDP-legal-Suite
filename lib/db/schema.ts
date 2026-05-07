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
    attendees: uuid("attendees").array().notNull().default(sql`ARRAY[]::uuid[]`),
    reminderMinutes: integer("reminder_minutes"),
    icalUid: text("ical_uid").notNull(),
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
  ],
);

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
