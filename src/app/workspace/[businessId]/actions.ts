"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { Database } from "@/config/bindings";
import { DomainError, toDomainError } from "@/core/errors";
import { enforceRateLimit } from "@/core/rate-limit";
import { recordAuditEvent } from "@/modules/audit";
import { getBindings, getSession, isRecentlyAuthenticated } from "@/modules/identity";
import {
  changeMemberRole,
  inviteMember,
  isRole,
  removeMember,
  resolveTenantContext,
  type TenantContext,
} from "@/modules/tenancy";

import type { FormState } from "../../form-state";

const inviteSchema = z.object({
  businessId: z.string().min(1).max(64),
  email: z.email().max(254),
  role: z.string().refine(isRole, "Choose a valid role."),
});

const memberSchema = z.object({
  businessId: z.string().min(1).max(64),
  membershipId: z.string().min(1).max(64),
  role: z.string().optional(),
});

async function auditFailure(businessId: string, action: string, error: unknown): Promise<void> {
  try {
    const { DB } = await getBindings();
    const domainError = toDomainError(error);
    await recordAuditEvent(DB, {
      action,
      outcome: domainError.code === "FORBIDDEN" ? "denied" : "failure",
      businessId,
      correlationId: crypto.randomUUID(),
      metadata: { code: domainError.code },
    });
  } catch {
    // Never mask the original failure with an audit failure.
  }
}

export async function inviteMemberAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession(await headers());
  if (session === null) return { status: "error", message: "Sign in required." };
  if (!isRecentlyAuthenticated(session.session)) {
    return { status: "error", message: "For security, sign in again before inviting members." };
  }

  const parsed = inviteSchema.safeParse({
    businessId: formData.get("businessId"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address and role." };
  }

  const { DB } = await getBindings();
  const context = await resolveTenantContext(DB, session.user.id, parsed.data.businessId);
  if (!context.ok) {
    return { status: "error", message: "Business not found." };
  }

  const limited = await enforceRateLimit(
    DB,
    `business:invite:${context.value.businessId}:${session.user.id}`,
    { windowSeconds: 60 * 60, max: 20 },
  );
  if (!limited.ok) return { status: "error", message: limited.error.message };

  const invitation = await inviteMember(DB, context.value, {
    email: parsed.data.email,
    role: parsed.data.role,
  });

  if (!invitation.ok) {
    await auditFailure(context.value.businessId, "tenancy.invitation_created", invitation.error);
    return { status: "error", message: invitation.error.message };
  }

  await recordAuditEvent(DB, {
    action: "tenancy.invitation_created",
    outcome: "success",
    actorUserId: session.user.id,
    businessId: context.value.businessId,
    targetType: "invitation",
    targetId: invitation.value.invitationId,
    correlationId: crypto.randomUUID(),
    metadata: { role: parsed.data.role },
  });

  return {
    status: "success",
    message:
      "Invitation created. Email delivery is not configured, so share this single-use link directly with the invitee. It expires in seven days.",
    link: `/invite/${invitation.value.token}`,
  };
}

async function mutateMembership(
  formData: FormData,
  action: string,
  mutate: (
    db: Database,
    context: TenantContext,
    parsed: z.infer<typeof memberSchema>,
  ) => Promise<{ ok: true } | { ok: false; error: DomainError }>,
): Promise<void> {
  const session = await getSession(await headers());
  if (session === null) redirect("/sign-in");
  if (!isRecentlyAuthenticated(session.session)) {
    redirect("/workspace?error=recent_auth_required");
  }

  const parsed = memberSchema.safeParse({
    businessId: formData.get("businessId"),
    membershipId: formData.get("membershipId"),
    role: formData.get("role") ?? undefined,
  });

  if (!parsed.success) redirect("/workspace?error=invalid_request");

  const { DB } = await getBindings();
  const context = await resolveTenantContext(DB, session.user.id, parsed.data.businessId);
  if (!context.ok) redirect("/workspace?error=not_found");

  const limited = await enforceRateLimit(
    DB,
    `business:members:${context.value.businessId}:${session.user.id}`,
    { windowSeconds: 60 * 60, max: 30 },
  );
  if (!limited.ok) {
    redirect(`/workspace/${context.value.businessId}?error=rate_limited`);
  }

  const result = await mutate(DB, context.value, parsed.data);

  if (!result.ok) {
    await auditFailure(context.value.businessId, action, result.error);
    redirect(
      `/workspace/${context.value.businessId}?error=${encodeURIComponent(result.error.code.toLowerCase())}`,
    );
  }

  await recordAuditEvent(DB, {
    action,
    outcome: "success",
    actorUserId: session.user.id,
    businessId: context.value.businessId,
    targetType: "membership",
    targetId: parsed.data.membershipId,
    correlationId: crypto.randomUUID(),
  });

  revalidatePath(`/workspace/${context.value.businessId}`);
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  await mutateMembership(formData, "tenancy.member_role_changed", async (db, context, parsed) => {
    if (parsed.role === undefined) {
      return { ok: false, error: new DomainError({ code: "INVALID_ARGUMENT", message: "Role required." }) };
    }
    const result = await changeMemberRole(db, context, {
      membershipId: parsed.membershipId,
      role: parsed.role,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  await mutateMembership(formData, "tenancy.member_removed", async (db, context, parsed) => {
    const result = await removeMember(db, context, { membershipId: parsed.membershipId });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });
}
