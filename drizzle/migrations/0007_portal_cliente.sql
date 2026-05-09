-- Fase 4.2 — Portal Cliente
--
-- Adds:
--   1. users.client_id (uuid, nullable, FK clients.id ON DELETE CASCADE)
--      For role='client' rows this points to the client whose data the user
--      can see in /portal. Application-side helpers enforce that role='client'
--      always carries a client_id. Cascade so deleting a client removes its
--      portal users (the user has no purpose without their client).
--   2. documents.shared_with_client (boolean NOT NULL DEFAULT false)
--      Marks documents that should appear in /portal/documentos. Defaults
--      false so internal drafts/working files stay hidden until explicitly
--      shared.

ALTER TABLE "users"
  ADD COLUMN "client_id" uuid;
--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_client_id_clients_id_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "users_firm_client_idx"
  ON "users" USING btree ("firm_id", "client_id");
--> statement-breakpoint

ALTER TABLE "documents"
  ADD COLUMN "shared_with_client" boolean NOT NULL DEFAULT false;
