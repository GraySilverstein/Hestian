import type { EmailMessage, Mailer } from "@/modules/identity/email";

/**
 * Test-only mail transport.
 *
 * It records messages so the suite can extract single-use tokens exactly as a
 * recipient would. It is never wired into production: the application only uses
 * the Resend adapter or the fail-closed unconfigured mailer.
 */
export function createCapturingMailer(): Mailer & { readonly messages: EmailMessage[] } {
  const messages: EmailMessage[] = [];
  return {
    messages,
    send: async (message: EmailMessage) => {
      messages.push(message);
      return { delivered: true };
    },
  };
}

export function lastLink(messages: readonly EmailMessage[]): string {
  const message = messages.at(-1);
  if (message === undefined) throw new Error("No email was captured.");
  const match = /(https?:\/\/[^\s]+)/.exec(message.text);
  if (match === null) throw new Error("No link in captured email.");
  return match[0];
}

export function tokenFrom(link: string): string {
  const url = new URL(link);
  const queryToken = url.searchParams.get("token");
  if (queryToken !== null) return queryToken;
  // Password-reset links carry the token as the last path segment
  // (`/api/auth/reset-password/<token>`).
  const segment = url.pathname.split("/").filter(Boolean).at(-1);
  if (segment === undefined) throw new Error("No token in link.");
  return decodeURIComponent(segment);
}
