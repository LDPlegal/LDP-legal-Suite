CREATE TYPE "public"."document_ocr_status" AS ENUM('pending', 'processing', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_source" AS ENUM('time_entry', 'expense', 'manual');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."ncf_type" AS ENUM('B01', 'B02', 'E31', 'E32');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'check', 'card', 'other');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid,
	"client_id" uuid,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"ocr_text" text,
	"ocr_status" "document_ocr_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"firm_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"source_type" "invoice_item_source" NOT NULL,
	"source_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(12, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.18' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"case_id" uuid,
	"number" text NOT NULL,
	"ncf" text,
	"ncf_type" "ncf_type",
	"issued_on" timestamp with time zone NOT NULL,
	"due_on" timestamp with time zone NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"itbis_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"isr_withholding_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"itbis_withholding_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'DOP' NOT NULL,
	"notes" text,
	"terms" text,
	"pdf_storage_key" text,
	"created_by" uuid,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ncf_counters" (
	"firm_id" uuid NOT NULL,
	"ncf_type" "ncf_type" NOT NULL,
	"range_start" integer NOT NULL,
	"range_end" integer NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"expires_on" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"author_id" uuid,
	"title" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_on" timestamp with time zone NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "attendees" SET DATA TYPE text[];--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "attendees" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncf_counters" ADD CONSTRAINT "ncf_counters_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_firm_idx" ON "documents" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "documents_firm_case_idx" ON "documents" USING btree ("firm_id","case_id");--> statement-breakpoint
CREATE INDEX "documents_firm_client_idx" ON "documents" USING btree ("firm_id","client_id");--> statement-breakpoint
CREATE INDEX "documents_parent_idx" ON "documents" USING btree ("parent_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_counters_pk" ON "invoice_counters" USING btree ("firm_id","year");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_source_idx" ON "invoice_items" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "invoices_firm_idx" ON "invoices" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_firm_number_unique" ON "invoices" USING btree ("firm_id","number") WHERE "invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_firm_ncf_unique" ON "invoices" USING btree ("firm_id","ncf") WHERE "invoices"."ncf" IS NOT NULL AND "invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoices_firm_client_idx" ON "invoices" USING btree ("firm_id","client_id");--> statement-breakpoint
CREATE INDEX "invoices_firm_status_idx" ON "invoices" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "invoices_firm_issued_idx" ON "invoices" USING btree ("firm_id","issued_on");--> statement-breakpoint
CREATE INDEX "invoices_firm_due_idx" ON "invoices" USING btree ("firm_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "ncf_counters_pk" ON "ncf_counters" USING btree ("firm_id","ncf_type");--> statement-breakpoint
CREATE INDEX "notes_firm_idx" ON "notes" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "notes_firm_case_idx" ON "notes" USING btree ("firm_id","case_id");--> statement-breakpoint
CREATE INDEX "notes_firm_updated_idx" ON "notes" USING btree ("firm_id","updated_at");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_paid_on_idx" ON "payments" USING btree ("paid_on");--> statement-breakpoint

-- =============================================================================
-- RLS for Fase 2 tables
-- =============================================================================
-- Same pattern as Fase 1: every firm-scoped table has firm_isolation; tables
-- that hang off a case (notes always, documents/invoices when case_id IS NOT
-- NULL) inherit visibility via app_user_can_see_case (SECURITY DEFINER).
-- invoice_items + payments hang off invoices, so we add a parallel helper
-- app_user_can_see_invoice that delegates the visibility check.
-- =============================================================================

ALTER TABLE "documents"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes"            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_items"    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ncf_counters"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Helper: can the current user see the given invoice?
-- Mirrors app_user_can_see_case but for invoices. SECURITY DEFINER bypasses
-- RLS on `invoices` and `cases` inside the function body so we don't recurse.
CREATE OR REPLACE FUNCTION app_user_can_see_invoice(p_invoice_id uuid, p_user_id uuid, p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = p_invoice_id
      AND i.firm_id = p_firm_id
      AND i.deleted_at IS NULL
      AND (
        i.case_id IS NULL
        OR app_user_can_see_case(i.case_id, p_user_id, p_firm_id)
      )
  )
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_user_can_see_invoice(uuid, uuid, uuid) TO PUBLIC;--> statement-breakpoint

-- ----- documents: firm + (case visibility OR firm-wide) ---------------------
CREATE POLICY "documents_firm_case_visibility" ON "documents"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
    )
  );
--> statement-breakpoint

-- ----- notes: case-scoped, full case visibility cascade ---------------------
CREATE POLICY "notes_firm_case_visibility" ON "notes"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
  );
--> statement-breakpoint

-- ----- invoices: firm + (case visibility OR firm-wide) ----------------------
CREATE POLICY "invoices_firm_case_visibility" ON "invoices"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
    )
  );
--> statement-breakpoint

-- ----- invoice_items: visible iff parent invoice is visible -----------------
CREATE POLICY "invoice_items_via_invoice" ON "invoice_items"
  USING (
    app_user_can_see_invoice(
      invoice_id,
      current_setting('app.user_id', true)::uuid,
      current_setting('app.firm_id', true)::uuid
    )
  )
  WITH CHECK (
    app_user_can_see_invoice(
      invoice_id,
      current_setting('app.user_id', true)::uuid,
      current_setting('app.firm_id', true)::uuid
    )
  );
--> statement-breakpoint

-- ----- payments: visible iff parent invoice is visible ----------------------
CREATE POLICY "payments_via_invoice" ON "payments"
  USING (
    app_user_can_see_invoice(
      invoice_id,
      current_setting('app.user_id', true)::uuid,
      current_setting('app.firm_id', true)::uuid
    )
  )
  WITH CHECK (
    app_user_can_see_invoice(
      invoice_id,
      current_setting('app.user_id', true)::uuid,
      current_setting('app.firm_id', true)::uuid
    )
  );
--> statement-breakpoint

-- ----- invoice_counters / ncf_counters: simple firm isolation ---------------
CREATE POLICY "invoice_counters_firm_isolation" ON "invoice_counters"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

CREATE POLICY "ncf_counters_firm_isolation" ON "ncf_counters"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
