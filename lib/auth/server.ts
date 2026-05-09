import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
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
  // nextCookies() must be the LAST plugin so it wraps all cookie writes from
  // earlier plugins. Without it, server actions (signUp, signOut) can't set
  // or clear the session cookie, which causes ERR_TOO_MANY_REDIRECTS on
  // logout (cookie persists → middleware redirects /login → /dashboard → ...).
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
