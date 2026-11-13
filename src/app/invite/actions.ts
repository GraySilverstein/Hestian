"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { enforceRateLimit } from "@/core/rate-limit";
import { recordAuditEvent } from "@/modules/audit";
import { getBindings, getSession } from "@/modules/identity";
import { acceptInvitation } from "@/modules/tenancy";

import type { FormState } from "../form-state";

const acceptSchema = z.object({
  token: z.string().min(20).max(512),
});

export async function acceptInvitationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession(await headers());
  if (session === null) {
    return { status: "error", message: "Sign in with the invited email address first." };
  }

  const parsed = acceptSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { status: "error", message: "This invitation link is invalid." };
  }

  const { DB } = await getBindings();

  const limited = await enforceRateLimit(DB, `invite:accept:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 20,
  });
  if (!limited.ok) return { status: "error", message: limited.error.message };

  const accepted = await acceptInvitation(DB, {
    userId: session.user.id,
    userEmail: session.user.email,
    token: parsed.data.token,
  });

  if (!accepted.ok) {
    await recordAuditEvent(DB, {
      action: "tenancy.invitation_accepted",
      outcome: "failure",
      actorUserId: session.user.id,
      correlationId: crypto.randomUUID(),
      metadata: { code: accepted.error.code },
    }).catch(() => undefined);

    return { status: "error", message: accepted.error.message };
  }

  await recordAuditEvent(DB, {
    action: "tenancy.invitation_accepted",
    outcome: "success",
    actorUserId: session.user.id,
    businessId: accepted.value.businessId,
    targetType: "membership",
    targetId: accepted.value.businessId,
    correlationId: crypto.randomUUID(),
  });

  revalidatePath("/workspace");
  redirect(`/workspace/${accepted.value.businessId}`);
}
