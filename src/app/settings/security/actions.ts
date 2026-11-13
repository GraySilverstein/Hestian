"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { enforceRateLimit } from "@/core/rate-limit";
import { recordAuditEvent } from "@/modules/audit";
import { getAuth, getBindings, getSession, isRecentlyAuthenticated } from "@/modules/identity";

import type { FormState } from "../../form-state";

/**
 * The provider's plugin endpoints are not represented in the base `Auth` type
 * because the application composes plugins at runtime. This narrow interface is
 * the only place that shape is asserted, so a provider upgrade fails at compile
 * time here rather than silently at runtime.
 */
interface TwoFactorApi {
  enableTwoFactor(input: {
    body: { password: string };
    headers: Headers;
  }): Promise<{ method: string; totpURI?: string; backupCodes?: string[] }>;
  verifyTOTP(input: { body: { code: string }; headers: Headers }): Promise<{ status?: boolean }>;
  disableTwoFactor(input: { body: { password: string }; headers: Headers }): Promise<unknown>;
  verifyPassword(input: { body: { password: string }; headers: Headers }): Promise<unknown>;
  revokeOtherSessions(input: { headers: Headers }): Promise<unknown>;
}

function twoFactorApi(auth: Awaited<ReturnType<typeof getAuth>>): TwoFactorApi {
  return auth.api as unknown as TwoFactorApi;
}

const passwordSchema = z.object({
  password: z.string().min(1).max(128),
});

const codeSchema = z.object({
  code: z.string().trim().min(6).max(32),
});

export interface EnrollmentState extends FormState {
  readonly totpUri?: string;
  readonly backupCodes?: readonly string[];
}

async function audit(
  action: string,
  outcome: "success" | "denied" | "failure",
  actorUserId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { DB } = await getBindings();
    await recordAuditEvent(DB, {
      action,
      outcome,
      actorUserId,
      correlationId: crypto.randomUUID(),
      ...(metadata === undefined ? {} : { metadata }),
    });
  } catch {
    // Enrolment state is still correct; the chain health check reports gaps.
  }
}

export async function startEnrollmentAction(
  _previous: EnrollmentState,
  formData: FormData,
): Promise<EnrollmentState> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (session === null) {
    return { status: "error", message: "Sign in required." };
  }
  if (!isRecentlyAuthenticated(session.session)) {
    return { status: "error", message: "Sign in again before changing security settings." };
  }

  const parsed = passwordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { status: "error", message: "Enter your current password." };
  }

  const { DB } = await getBindings();
  const limited = await enforceRateLimit(DB, `mfa:enroll:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 5,
  });
  if (!limited.ok) {
    return { status: "error", message: "Too many attempts. Try again later." };
  }

  const auth = await getAuth();
  try {
    const result = await twoFactorApi(auth).enableTwoFactor({
      body: { password: parsed.data.password },
      headers: requestHeaders,
    });

    await audit("identity.mfa_enrollment_started", "success", session.user.id);

    if (result.totpURI === undefined) {
      return { status: "error", message: "The authenticator secret could not be created." };
    }

    return {
      status: "success",
      message: "Scan the secret, then confirm with a code. Recovery codes are shown once.",
      totpUri: result.totpURI,
      backupCodes: result.backupCodes ?? [],
    };
  } catch {
    await audit("identity.mfa_enrollment_failed", "failure", session.user.id);
    return {
      status: "error",
      message: "Enrolment could not start. Check your password and try again.",
    };
  }
}

export async function confirmEnrollmentAction(
  _previous: EnrollmentState,
  formData: FormData,
): Promise<EnrollmentState> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (session === null) {
    return { status: "error", message: "Sign in required." };
  }

  const parsed = codeSchema.safeParse({ code: String(formData.get("code") ?? "").trim() });
  if (!parsed.success) {
    return { status: "error", message: "Enter the current 6-digit code." };
  }

  const { DB } = await getBindings();
  const limited = await enforceRateLimit(DB, `mfa:confirm:${session.user.id}`, {
    windowSeconds: 60 * 5,
    max: 10,
  });
  if (!limited.ok) {
    return { status: "error", message: "Too many attempts. Wait a few minutes and try again." };
  }

  const auth = await getAuth();
  try {
    await twoFactorApi(auth).verifyTOTP({ body: { code: parsed.data.code }, headers: requestHeaders });
  } catch {
    await audit("identity.mfa_enrollment_failed", "failure", session.user.id);
    return { status: "error", message: "That code is not valid. Try the next one." };
  }

  // Security-sensitive change: drop every other session.
  await twoFactorApi(auth)
    .revokeOtherSessions({ headers: requestHeaders })
    .catch(() => undefined);
  await audit("identity.mfa_enabled", "success", session.user.id);

  return { status: "success", message: "Two-factor authentication is now required for this account." };
}

export async function disableMfaAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (session === null) {
    return { status: "error", message: "Sign in required." };
  }
  if (!isRecentlyAuthenticated(session.session)) {
    return { status: "error", message: "Sign in again before changing security settings." };
  }

  const parsed = passwordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { status: "error", message: "Enter your current password." };
  }

  const { DB } = await getBindings();
  const limited = await enforceRateLimit(DB, `mfa:disable:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 5,
  });
  if (!limited.ok) {
    return { status: "error", message: "Too many attempts. Try again later." };
  }

  const auth = await getAuth();
  try {
    await twoFactorApi(auth).verifyPassword({
      body: { password: parsed.data.password },
      headers: requestHeaders,
    });
    await twoFactorApi(auth).disableTwoFactor({
      body: { password: parsed.data.password },
      headers: requestHeaders,
    });
  } catch {
    await audit("identity.mfa_disabled", "failure", session.user.id);
    return { status: "error", message: "Two-factor authentication could not be disabled." };
  }

  await twoFactorApi(auth)
    .revokeOtherSessions({ headers: requestHeaders })
    .catch(() => undefined);
  await audit("identity.mfa_disabled", "success", session.user.id);

  return { status: "success", message: "Two-factor authentication is disabled." };
}
