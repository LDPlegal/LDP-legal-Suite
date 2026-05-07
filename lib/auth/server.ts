import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
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
  },
});

export type Auth = typeof auth;
