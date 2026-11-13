"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enforceRateLimit } from "@/core/rate-limit";
import { recordAuditEvent } from "@/modules/audit";
import { getAuth, getBindings, getSession } from "@/modules/identity";

import { safeNextPath, type FormState } from "../../form-state";

const codeSchema = z.object({
  code: z.string().trim().min(6, "Enter the 6-digit code.").max(32),
  useRecoveryCode: z.boolean(),
  next: z.string().optional(),
});

const INVALID_CODE = "That code is not valid. Check your authenticator and try again.";

/** Plugin endpoints are composed at runtime; assert the shape in one place. */
interface TwoFactorVerificationApi {
  verifyTOTP(input: { body: { code: string }; headers: Headers }): Promise<{ status?: boolean }>;
  verifyBackupCode(input: { body: { code: string }; headers: Headers }): Promise<unknown>;
}

async function audit(action: string, outcome: "success" | "failure"): Promise<void> {
  try {
    const { DB } = await getBindings();
    await recordAuditEvent(DB, {
      action,
      outcome,
      correlationId: crypto.randomUUID(),
    });
  } catch {
    // The verification result is the user-facing outcome; audit failure is
    // surfaced by the chain health check rather than blocking sign-in.
  }
}

/**
 * Completes a pending second-factor challenge.
 *
 * The pending challenge is a short-lived signed cookie issued by the provider;
 * the request carries no user id, and no session exists until verification
 * succeeds. Failure is generic so a wrong code cannot reveal account details.
 */
export async function verifyTwoFactorAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = codeSchema.safeParse({
    code: String(formData.get("code") ?? "").trim(),
    useRecoveryCode: formData.get("useRecoveryCode") === "on",
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: INVALID_CODE };
  }

  const { DB } = await getBindings();
  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip") ?? "unknown";
  const limited = await enforceRateLimit(DB, `two-factor:${ip}`, {
    windowSeconds: 60,
    max: 10,
  });
  if (!limited.ok) {
    return { status: "error", message: "Too many attempts. Wait a minute and try again." };
  }

  const auth = await getAuth();
  const api = auth.api as unknown as TwoFactorVerificationApi;

  try {
    if (parsed.data.useRecoveryCode) {
      await api.verifyBackupCode({
        body: { code: parsed.data.code },
        headers: requestHeaders,
      });
    } else {
      await api.verifyTOTP({
        body: { code: parsed.data.code },
        headers: requestHeaders,
      });
    }
  } catch {
    await audit(
      parsed.data.useRecoveryCode
        ? "identity.mfa_recovery_failed"
        : "identity.mfa_verification_failed",
      "failure",
    );
    return { status: "error", message: INVALID_CODE };
  }

  const session = await getSession(requestHeaders);
  if (session === null) {
    return { status: "error", message: INVALID_CODE };
  }

  await audit(
    parsed.data.useRecoveryCode ? "identity.mfa_recovery_used" : "identity.mfa_verified",
    "success",
  );
  redirect(safeNextPath(parsed.data.next));
}
