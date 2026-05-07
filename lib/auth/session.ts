// Server-side session helpers. Use these in server actions, server components,
// and route handlers. They call into better-auth (which uses the admin
// connection — see lib/auth/server.ts) and return the firm + user identifiers
// that domain code needs to pass to withFirm().

import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export type SessionUser = {
  userId: string;
  firmId: string;
  role: "admin" | "partner" | "lawyer" | "paralegal" | "client";
  email: string;
  name: string;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });
  if (!session) return null;

  const user = session.user as typeof session.user & {
    firmId?: string;
    role?: SessionUser["role"];
  };
  if (!user.firmId || !user.role) {
    // A user without firmId/role is invalid for this app; force re-auth.
    return null;
  }

  return {
    userId: user.id,
    firmId: user.firmId,
    role: user.role,
    email: user.email,
    name: user.name,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
