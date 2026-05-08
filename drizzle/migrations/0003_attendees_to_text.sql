-- 0003_attendees_to_text.sql
-- =============================================================================
-- Convert events.attendees from uuid[] to text[].
-- =============================================================================
-- Drizzle 0.38 + node-postgres serialises a JS array bound to a uuid[]
-- column incorrectly: a single-element array is sent as a bare uuid string
-- without the `{...}` array literal wrapping, so Postgres rejects it with
-- "literal de array mal formado". The values themselves are still UUIDs;
-- we just store them as text and validate at the Zod layer.
-- The events.attendees && ${userIds}::uuid[] check in findConflictingEvents
-- now compares text arrays, which still works because both sides are text.
-- =============================================================================

ALTER TABLE "events" ALTER COLUMN "attendees" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "attendees" TYPE text[] USING attendees::text[];--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "attendees" SET DEFAULT ARRAY[]::text[];
