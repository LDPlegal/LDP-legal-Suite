-- Add optional case correlation column to audit_log so events for entities
-- attached to a case (invoices, time entries, expenses, documents, notes,
-- tasks, events) can be listed together in the case detail's Bitácora tab.
--
-- Without this column, listAuditFor with entity_type='case' only matches
-- events whose target IS the case itself; invoice events stayed invisible
-- in the case bitácora even though they were generated from the case.

ALTER TABLE "audit_log"
  ADD COLUMN "case_id" uuid;
--> statement-breakpoint

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_case_id_cases_id_fk"
  FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "audit_firm_case_idx"
  ON "audit_log" USING btree ("firm_id","case_id");
