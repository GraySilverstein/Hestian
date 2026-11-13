"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainError } from "@/core/errors";
import { recordAuditEvent } from "@/modules/audit";
import { getAuth, getBindings, getSession, resendVerificationEmail } from "@/modules/identity";

import { safeNextPath, type FormState } from "../form-state";

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  next: z.string().optional(),
});

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  next: z.string().optional(),
});

const emailSchema = z.object({
  email: z.email().max(254),
});

const resetSchema = z.object({
  token: z.string().min(20).max(512),
  password: z.string().min(12).max(128),
});

const GENERIC_SIGN_IN_ERROR = "Invalid email or password.";
const GENERIC_SIGN_UP_ERROR = "An account could not be created with those details.";
const GENERIC_RESET_REQUEST = "If an account exists for that address, a reset link has been sent.";
const GENERIC_VERIFICATION_REQUEST =
  "If that address needs verification, a new link has been sent.";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}

async function audit(
  action: string,
  outcome: "success" | "denied" | "failure",
  fields: { actorUserId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const { DB } = await getBindings();
    await recordAuditEvent(DB, {
      action,
      outcome,
      actorUserId: fields.actorUserId ?? null,
      correlationId: crypto.randomUUID(),
      ...(fields.metadata === undefined ? {} : { metadata: fields.metadata }),
    });
  } catch {
    // Authentication must not fail because the audit append failed, but the
    // failure is surfaced by the audit-chain health check instead of hidden.
  }
}

export async function signUpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const auth = await getAuth();
  const requestHeaders = await headers();

  let userId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
      },
      headers: requestHeaders,
    });
    userId = result.user.id;
  } catch (error) {
    await audit("identity.sign_up", "failure", {
      metadata: { reason: error instanceof DomainError ? error.code : "rejected" },
    });
    return { status: "error", message: GENERIC_SIGN_UP_ERROR };
  }

  await audit("identity.sign_up", "success", { actorUserId: userId });
  redirect(safeNextPath(parsed.data.next));
}

export async function signInAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: GENERIC_SIGN_IN_ERROR };
  }

  const auth = await getAuth();
  const requestHeaders = await headers();

  let twoFactorRequired = false;
  try {
    const result = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: requestHeaders,
    });

    // A 2FA-enabled account gets a challenge cookie, not a session. The second
    // factor must be completed before any protected route can be reached.
    twoFactorRequired = "twoFactorRedirect" in result && result.twoFactorRedirect === true;
  } catch {
    // Deliberately identical for unknown accounts, wrong passwords and
    // unverified addresses to prevent account enumeration.
    await audit("identity.sign_in", "failure");
    return { status: "error", message: GENERIC_SIGN_IN_ERROR };
  }

  if (twoFactorRequired) {
    await audit("identity.two_factor_challenged", "success");
    redirect(`/two-factor?next=${encodeURIComponent(safeNextPath(parsed.data.next))}`);
  }

  const session = await getSession(requestHeaders);
  await audit("identity.sign_in", "success", { actorUserId: session?.user.id ?? null });

  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  const auth = await getAuth();
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  try {
    await auth.api.signOut({ headers: requestHeaders });
  } finally {
    await audit("identity.sign_out", "success", { actorUserId: session?.user.id ?? null });
  }

  redirect("/sign-in");
}

export async function signOutEverywhereAction(): Promise<void> {
  const auth = await getAuth();
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  try {
    await auth.api.revokeSessions({ headers: requestHeaders });
  } finally {
    await audit("identity.sessions_revoked", "success", {
      actorUserId: session?.user.id ?? null,
    });
  }

  redirect("/sign-in");
}

export async function resendVerificationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });

  if (!parsed.success) {
    return { status: "success", message: GENERIC_VERIFICATION_REQUEST };
  }

  const { DB, BETTER_AUTH_URL } = await getBindings();
  const auth = await getAuth();
  const baseURL = (BETTER_AUTH_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

  const outcome = await resendVerificationEmail(
    DB,
    auth,
    parsed.data.email,
    `${baseURL}/workspace`,
  );

  await audit(
    "identity.verification_resent",
    outcome.rateLimited ? "denied" : "success",
  );
  return { status: "success", message: GENERIC_VERIFICATION_REQUEST };
}

export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });

  // Always report the same outcome, whether or not the address is registered.
  if (!parsed.success) {
    return { status: "success", message: GENERIC_RESET_REQUEST };
  }

  try {
    const auth = await getAuth();
    const { BETTER_AUTH_URL } = await getBindings();
    const baseURL = (BETTER_AUTH_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

    await auth.api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: `${baseURL}/reset-password` },
    });
  } catch {
    // Swallow provider and account errors: the response must stay uniform.
  }

  await audit("identity.password_reset_requested", "success");
  return { status: "success", message: GENERIC_RESET_REQUEST };
}

export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  try {
    const auth = await getAuth();
    await auth.api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
    });
  } catch {
    await audit("identity.password_reset", "failure");
    return { status: "error", message: "That reset link is invalid or has expired." };
  }

  await audit("identity.password_reset", "success");
  return {
    status: "success",
    message: "Password updated. All existing sessions were revoked; sign in again.",
  };
}
