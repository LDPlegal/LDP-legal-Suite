"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function logoutAction(): Promise<void> {
  const requestHeaders = await headers();
  await auth.api.signOut({ headers: requestHeaders });
  redirect("/login");
}
