// Server-side session helpers. Use these in server actions, server components,
// and route handlers. They call into better-auth (which uses the admin
// connection — see lib/auth/server.ts) and return the firm + user identifiers
// that domain code needs to pass to withFirm().

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/db/admin";
import { users as usersTable } from "@/lib/db/schema";
import { auth } from "./server";

export type SessionUser = {
  userId: string;
  firmId: string;
  role: "admin" | "partner" | "lawyer" | "paralegal" | "client";
  email: string;
  name: string;
  // Set only when role='client' (Portal Cliente). Identifies which client's
  // data this user can see in /portal. Always null for staff roles.
  clientId: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });
  if (!session) return null;

  const user = session.user as typeof session.user & {
    firmId?: string;
    role?: SessionUser["role"];
    clientId?: string | null;
  };
  if (!user.firmId || !user.role) {
    // A user without firmId/role is invalid for this app; force re-auth.
    return null;
  }

  // Belt-and-suspenders soft-delete check. better-auth's cookie cache (5 min
  // TTL) means session.user can survive after we soft-delete the row — for
  // example when a portal user's owning client gets archived. Verify the
  // user is still alive on each request before treating them as logged in.
  // The query is a single PK lookup, indexed; cost is trivial.
  const [live] = await adminDb
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, user.id), isNull(usersTable.deletedAt)))
    .limit(1);
  if (!live) return null;

  return {
    userId: user.id,
    firmId: user.firmId,
    role: user.role,
    email: user.email,
    name: user.name,
    clientId: user.clientId ?? null,
  };
}

// Default helper for staff areas: redirects to /login if anonymous, and
// kicks portal-clients out to /portal/dashboard so they can't accidentally
// land on internal pages by hitting /casos directly.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "client") redirect("/portal/dashboard");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

// Portal Cliente entry point: requires role='client' and a non-null clientId.
// Anything else (anonymous, staff role, role='client' but missing client_id —
// data integrity bug) is sent to login.
export type PortalSessionUser = SessionUser & { role: "client"; clientId: string };

export async function requirePortalUser(): Promise<PortalSessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "client") redirect("/dashboard");
  if (!user.clientId) {
    // role='client' without a client_id is broken state; refuse to render
    // the portal rather than leak cross-client data.
    redirect("/login");
  }
  return user as PortalSessionUser;
}
