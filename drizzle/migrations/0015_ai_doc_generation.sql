-- F7 bloque 2 — Audit trail para documentos generados por IA.

ALTER TABLE "documents" ADD COLUMN "ai_generated" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_original_prompt" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_skill_ids" text[];
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_chat_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_status" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_by" uuid;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_reviewed_by_users_id_fk"
  FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Index to surface AI-generated docs pending review across the firm.
CREATE INDEX "documents_firm_review_idx"
  ON "documents" USING btree ("firm_id", "review_status")
  WHERE "ai_generated" = true AND "deleted_at" IS NULL;
