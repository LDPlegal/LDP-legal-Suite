"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    // F7 bloque 4: expone authClient.twoFactor.{enable, verifyTotp, disable,
    // verifyBackupCode}. Cuando un signin requiere 2FA, el server responde
    // con `twoFactorRedirect: true` y el client redirige al challenge.
    twoFactorClient(),
  ],
});
export const { signIn, signOut, useSession } = authClient;
