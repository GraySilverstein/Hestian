export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Outbound email port.
 *
 * Email delivery is not configured in this milestone: no provider credential is
 * available and no message is fabricated. When no mailer is configured, the port
 * reports `delivered: false` so callers and audit records show the truth instead
 * of pretending a verification or reset email was sent.
 */
export interface Mailer {
  send(message: EmailMessage): Promise<{ delivered: boolean; reason?: string }>;
}

export type EmailOutcome =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly reason: "unconfigured" | "provider_error" };

/**
 * No-op mailer used until a provider is configured.
 *
 * It deliberately never logs the message body: verification and reset messages
 * contain single-use tokens that must not reach logs.
 */
export function createUnconfiguredMailer(): Mailer {
  return {
    send: async () => ({ delivered: false, reason: "unconfigured" }),
  };
}

export interface EmailConfig {
  readonly from: string | undefined;
  readonly resendApiKey: string | undefined;
}

/**
 * Builds the mailer for the current environment.
 *
 * The Resend HTTP API is used when a key is present; otherwise delivery is
 * reported as unconfigured. No SDK dependency is needed for a single POST.
 */
export function createMailer(config: EmailConfig): Mailer {
  if (config.resendApiKey === undefined || config.from === undefined) {
    return createUnconfiguredMailer();
  }

  return {
    send: async (message) => {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.resendApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
        });

        return response.ok
          ? { delivered: true }
          : { delivered: false, reason: "provider_error" };
      } catch {
        return { delivered: false, reason: "provider_error" };
      }
    },
  };
}

export async function attemptDelivery(
  mailer: Mailer,
  message: EmailMessage,
): Promise<EmailOutcome> {
  const result = await mailer.send(message);
  if (result.delivered) return { delivered: true };
  return {
    delivered: false,
    reason: result.reason === "unconfigured" ? "unconfigured" : "provider_error",
  };
}
