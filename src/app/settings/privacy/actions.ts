"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enforceRateLimit } from "@/core/rate-limit";
import { requestDeletion, requestExport } from "@/modules/governance";
import { getAuth, getBindings, getSession, isRecentlyAuthenticated } from "@/modules/identity";

import type { FormState } from "../../form-state";

const deleteSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal("DELETE", { message: 'Type DELETE to confirm.' }),
});

export interface ExportState extends FormState {
  readonly exportId?: string;
}

const RECENT_AUTH_REQUIRED = "For security, sign in again before continuing.";

export async function requestExportAction(): Promise<ExportState> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (session === null) {
    return { status: "error", message: "Sign in required." };
  }
  if (!isRecentlyAuthenticated(session.session)) {
    return { status: "error", message: RECENT_AUTH_REQUIRED };
  }

  const { DB } = await getBindings();
  const limited = await enforceRateLimit(DB, `privacy:export:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 3,
  });
  if (!limited.ok) {
    return { status: "error", message: "Too many export requests. Try again in an hour." };
  }

  const result = await requestExport(DB, session.user.id);
  if (!result.ok) {
    return { status: "error", message: result.error.message };
  }

  revalidatePath("/settings/privacy");
  return {
    status: "success",
    message: "Export generated. It is available only to you and expires in one hour.",
    exportId: result.value.exportId,
    link: `/api/privacy/export/${result.value.exportId}`,
  };
}

export async function deleteAccountAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (session === null) {
    return { status: "error", message: "Sign in required." };
  }
  if (!isRecentlyAuthenticated(session.session)) {
    return { status: "error", message: RECENT_AUTH_REQUIRED };
  }

  const parsed = deleteSchema.safeParse({
    password: formData.get("password"),
    confirmation: String(formData.get("confirmation") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: 'Check the highlighted fields. Type DELETE exactly to confirm.',
    };
  }

  const { DB } = await getBindings();
  const limited = await enforceRateLimit(DB, `privacy:delete:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 3,
  });
  if (!limited.ok) {
    return { status: "error", message: "Too many attempts. Try again later." };
  }

  const auth = await getAuth();
  const api = auth.api as unknown as {
    verifyPassword(input: { body: { password: string }; headers: Headers }): Promise<unknown>;
  };

  try {
    await api.verifyPassword({
      body: { password: parsed.data.password },
      headers: requestHeaders,
    });
  } catch {
    return { status: "error", message: "That password is not correct." };
  }

  const result = await requestDeletion(DB, session.user.id);
  if (!result.ok) {
    return { status: "error", message: result.error.message };
  }

  if (result.value.status === "blocked") {
    const names = result.value.blockers.map((blocker) => blocker.businessName).join(", ");
    return {
      status: "error",
      message: `Deletion is blocked because you are the only owner of: ${names}. Transfer ownership first. Financial and business records are not deleted with your account.`,
    };
  }

  redirect("/sign-in?deleted=1");
}
