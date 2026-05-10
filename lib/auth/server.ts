import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import * as schema from "@/lib/db/schema";

// Better-auth uses the ADMIN connection (BYPASSRLS) for sessions, accounts,
// users, and verifications. This is intentional and documented in
// DECISIONS.md (decision 9.1, signup exception):
//   * Better-auth has no firm context during signin/signup, so RLS would
//     reject every read. Using the admin connection sidesteps that.
//   * Domain code never touches sessions/accounts/verifications directly —
//     it always goes through better-auth's API or withFirm() on domain
//     tables. The defense-in-depth RLS policies on those auxiliary tables
//     prevent accidental cross-firm reads if domain code ever queries them.
//   * Server actions read the session via auth.api.getSession({ headers })
//     and then use the resulting firmId/userId to scope all subsequent
//     queries through withFirm.

const secret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is required in .env");
}

export const auth = betterAuth({
  baseURL: baseUrl,
  secret,
  database: drizzleAdapter(adminDb, {
    provider: "pg",
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 72,
    // Reset-password flow (Fase 6). When the user requests a reset we just
    // log the link in development — no email provider wired yet. The admin
    // can copy the URL from the server log and share it manually. In
    // production this should be replaced with a real email provider
    // (Resend / Postmark / SES).
    async sendResetPassword({ user, url }) {
      console.log(
        `[auth] Reset password URL for ${user.email}: ${url}\n` +
          `(replace this stub with a real email send in production)`,
      );
    },
  },
  user: {
    additionalFields: {
      firmId: {
        type: "string",
        required: true,
        input: true,
      },
      role: {
        type: "string",
        required: true,
        input: true,
        defaultValue: "lawyer",
      },
      // Portal Cliente (Fase 4): set on role='client' rows so the portal
      // layout knows which client's data to scope queries to. Optional —
      // staff users have no client_id.
      clientId: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: {
    cookiePrefix: "ldp",
    database: {
      // Schema uses uuid PKs (users.id, etc.). Better-auth's default id
      // generator emits short random strings that Postgres rejects when
      // casting to uuid. Force UUIDs so all PKs match the column type.
      generateId: () => crypto.randomUUID(),
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Sanitise user creations that arrive through better-auth's HTTP
        // endpoints (POST /api/auth/sign-up/email). Without this hook,
        // anyone with the URL can inject `role: "admin"` and a known
        // `firmId` to plant a privileged user inside someone else's firm.
        //
        // The hook fires for BOTH paths:
        //   - HTTP endpoint  → context is non-null  (the public threat)
        //   - internalAdapter.createUser() called from server code →
        //     context is null  (our own admin actions, trusted)
        //
        // We scrub the dangerous fields only when context is non-null.
        // Server-side code that legitimately needs to set role='client' +
        // clientId (e.g. invitarPortalAction) uses internalAdapter.createUser
        // and so passes through untouched.
        async before(user, context) {
          if (context === null) return; // trusted server-side path
          const u = user as Record<string, unknown>;
          const firmId = typeof u.firmId === "string" ? u.firmId : null;
          if (!firmId) return false;

          // Public signups are only allowed when the firm has no users yet
          // (the first-admin flow from /signup). Any subsequent attempt to
          // create a user via the public endpoint targeting an existing firm
          // is rejected — preventing privilege escalation by injecting a
          // known firmId. To add staff to an existing firm, an admin must
          // call internalAdapter.createUser from a server action (which
          // bypasses this hook because context is null).
          const existing = await adminDb
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
            .limit(1);
          if (existing.length > 0) return false;

          return {
            data: {
              ...u,
              role: "admin",
              clientId: null,
            },
          };
        },
      },
    },
    session: {
      create: {
        // Refuse to create a session for soft-deleted users. better-auth's
        // signin only validates email + password; it doesn't know about
        // users.deletedAt. Without this hook, a portal user whose owning
        // client was just archived would still be able to re-login (the
        // password check passes) and trigger getCurrentUser → null on the
        // next request, looking like a broken login. Stop earlier.
        async before(session) {
          const userId = (session as { userId?: string }).userId;
          if (!userId) return;
          const [live] = await adminDb
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
            .limit(1);
          if (!live) return false;
        },
        // After a session is created (signup auto-login OR signin), bump the
        // user's lastLoginAt + flip status from 'invited' → 'active' so the
        // UI reflects "first-login happened".
        async after(session) {
          const userId = (session as { userId?: string }).userId;
          if (!userId) return;
          await adminDb
            .update(schema.users)
            .set({ lastLoginAt: new Date(), status: "active", updatedAt: new Date() })
            .where(eq(schema.users.id, userId));
        },
      },
    },
  },
  // nextCookies() must be the LAST plugin so it wraps all cookie writes from
  // earlier plugins. Without it, server actions (signUp, signOut) can't set
  // or clear the session cookie, which causes ERR_TOO_MANY_REDIRECTS on
  // logout (cookie persists → middleware redirects /login → /dashboard → ...).
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
