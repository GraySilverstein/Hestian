"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toDomainError } from "@/core/errors";
import { isCurrencyCode } from "@/core/money";
import { enforceRateLimit } from "@/core/rate-limit";
import { recordAuditEvent } from "@/modules/audit";
import { getBindings, getSession, isRecentlyAuthenticated } from "@/modules/identity";
import { createBusiness } from "@/modules/tenancy";

import type { FormState } from "../form-state";

const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Enter a business name.").max(120),
  currency: z.string().refine(isCurrencyCode, "Choose a supported currency."),
});

export async function createBusinessAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession(await headers());
  if (session === null) {
    return { status: "error", message: "Sign in required." };
  }

  if (!isRecentlyAuthenticated(session.session)) {
    return {
      status: "error",
      message: "For security, sign in again before creating a business.",
    };
  }

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
      ),
    };
  }

  const { DB } = await getBindings();

  const limited = await enforceRateLimit(DB, `business:create:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 10,
  });
  if (!limited.ok) {
    return { status: "error", message: limited.error.message };
  }

  const created = await createBusiness(DB, {
    userId: session.user.id,
    name: parsed.data.name,
    currency: parsed.data.currency,
  });

  if (!created.ok) {
    return { status: "error", message: created.error.message };
  }

  const businessId = created.value.businessId;

  try {
    await recordAuditEvent(DB, {
      action: "tenancy.business_created",
      outcome: "success",
      actorUserId: session.user.id,
      businessId,
      targetType: "business",
      targetId: businessId,
      correlationId: crypto.randomUUID(),
      metadata: { currency: parsed.data.currency },
    });
  } catch (error) {
    // The business exists; report the audit failure rather than pretending the
    // operation was fully recorded.
    const domainError = toDomainError(error);
    return {
      status: "error",
      message: `Business created, but the audit record failed (${domainError.code}). Contact support before relying on this business.`,
    };
  }

  revalidatePath("/workspace");
  redirect(`/workspace/${businessId}`);
}
