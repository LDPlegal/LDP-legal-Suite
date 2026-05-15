-- F7 — Chat persistente por expediente + contexto incremental.

CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'system');
--> statement-breakpoint

CREATE TABLE "matter_chats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "role" chat_role NOT NULL,
  "content" text NOT NULL,
  "tool_calls" jsonb,
  "input_tokens" integer,
  "output_tokens" integer,
  "cache_read_tokens" integer,
  "cache_creation_tokens" integer,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "matter_chats"
  ADD CONSTRAINT "matter_chats_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "matter_chats"
  ADD CONSTRAINT "matter_chats_case_fk"
  FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "matter_chats"
  ADD CONSTRAINT "matter_chats_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "matter_chats_firm_case_idx" ON "matter_chats" USING btree ("firm_id", "case_id");
--> statement-breakpoint
CREATE INDEX "matter_chats_firm_case_created_idx" ON "matter_chats" USING btree ("firm_id", "case_id", "created_at");
--> statement-breakpoint

ALTER TABLE "matter_chats" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "matter_chats_firm_isolation" ON "matter_chats"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- matter_contexts: one summary per case, updated incrementally.

CREATE TABLE "matter_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "case_id" uuid NOT NULL UNIQUE,
  "summary" text NOT NULL DEFAULT '',
  "stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "token_count" integer NOT NULL DEFAULT 0,
  "needs_refresh" boolean NOT NULL DEFAULT true,
  "refreshed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "matter_contexts"
  ADD CONSTRAINT "matter_contexts_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "matter_contexts"
  ADD CONSTRAINT "matter_contexts_case_fk"
  FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "matter_contexts_firm_idx" ON "matter_contexts" USING btree ("firm_id");
--> statement-breakpoint

ALTER TABLE "matter_contexts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "matter_contexts_firm_isolation" ON "matter_contexts"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
