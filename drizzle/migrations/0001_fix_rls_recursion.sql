-- 0001_fix_rls_recursion.sql
-- =============================================================================
-- Fix: infinite recursion between RLS policies on `cases` and `case_assignments`
-- =============================================================================
-- The original `cases_firm_visibility` policy did EXISTS subqueries against
-- `case_assignments` and `users`. The `case_assignments_firm_isolation` policy
-- in turn did an EXISTS against `cases`. Postgres detected the cycle and
-- aborted with "infinite recursion detected in policy for relation 'cases'".
--
-- Standard fix: extract the cross-table lookups into SECURITY DEFINER helper
-- functions. Those run as the function OWNER (postgres = BYPASSRLS), so the
-- queries inside DO NOT trigger RLS, and the cycle disappears.
--
-- Each function is STABLE (results don't change within a statement) and
-- SET search_path explicitly to `public, pg_temp` to follow the
-- SECURITY DEFINER hardening guidance from the Postgres docs.
-- =============================================================================

DROP POLICY IF EXISTS "cases_firm_visibility" ON "cases";--> statement-breakpoint
DROP POLICY IF EXISTS "case_assignments_firm_isolation" ON "case_assignments";--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_assigned_to_case(p_case_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM case_assignments
    WHERE case_id = p_case_id AND user_id = p_user_id
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_is_admin_of_firm(p_user_id uuid, p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND firm_id = p_firm_id
      AND role = 'admin'
      AND deleted_at IS NULL
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_case_in_firm(p_case_id uuid, p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cases
    WHERE id = p_case_id AND firm_id = p_firm_id
  )
$$;
--> statement-breakpoint

-- Recreate the policies using the SECURITY DEFINER helpers. No more recursion.

CREATE POLICY "cases_firm_visibility" ON "cases"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      visibility = 'firm'
      OR app_user_assigned_to_case(id, current_setting('app.user_id', true)::uuid)
      OR app_user_is_admin_of_firm(
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  )
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

CREATE POLICY "case_assignments_firm_isolation" ON "case_assignments"
  USING (
    app_case_in_firm(case_id, current_setting('app.firm_id', true)::uuid)
  )
  WITH CHECK (
    app_case_in_firm(case_id, current_setting('app.firm_id', true)::uuid)
  );
--> statement-breakpoint

-- The function owner is the migrate role (postgres). app_user needs EXECUTE
-- to invoke them from policy expressions. Granting to PUBLIC keeps it simple
-- — the SECURITY DEFINER ensures privileged execution regardless of caller.
GRANT EXECUTE ON FUNCTION app_user_assigned_to_case(uuid, uuid) TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_is_admin_of_firm(uuid, uuid) TO PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_case_in_firm(uuid, uuid) TO PUBLIC;
