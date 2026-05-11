// lib/email/index.ts
//
// Email abstraction. Mirror of lib/storage: callers go through `sendEmail`
// without knowing which provider is configured. Two implementations:
//
//   - "console" (default in dev): logs to stdout. Never fails. Useful so
//     reset-password etc work locally without configuring anything.
//   - "resend":   sends via the Resend API. Requires RESEND_API_KEY and
//                 EMAIL_FROM (a verified sender on the account).
//
// Selected via EMAIL_DRIVER env var.

import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  // HTML body. Most providers (including Resend) prefer HTML; we fall back
  // to a plaintext copy automatically by stripping tags.
  html: string;
  // Optional reply-to override.
  replyTo?: string;
};

export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>;
}

class ConsoleProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<void> {
    console.log(
      `[email] (no provider configured)\nTo: ${input.to}\nSubject: ${input.subject}\n---\n${stripHtml(input.html)}\n---`,
    );
  }
}

class ResendProvider implements EmailProvider {
  private clientPromise: Promise<{
    emails: { send: (params: unknown) => Promise<unknown> };
  }> | null = null;

  private async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = import("resend").then(({ Resend }) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY required when EMAIL_DRIVER=resend");
        return new Resend(apiKey) as unknown as {
          emails: { send: (params: unknown) => Promise<unknown> };
        };
      });
    }
    return this.clientPromise;
  }

  async send(input: SendEmailInput): Promise<void> {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_FROM required when EMAIL_DRIVER=resend");
    const client = await this.getClient();
    await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo,
    });
  }
}

let providerSingleton: EmailProvider | null = null;

export function getEmail(): EmailProvider {
  if (providerSingleton) return providerSingleton;
  const driver = process.env.EMAIL_DRIVER ?? "console";
  if (driver === "resend") providerSingleton = new ResendProvider();
  else providerSingleton = new ConsoleProvider();
  return providerSingleton;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  await getEmail().send(input);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
