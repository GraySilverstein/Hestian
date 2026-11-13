import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOutAction } from "@/app/(auth)/actions";
import { listBusinessAuditEvents, verifyAuditChain } from "@/modules/audit";
import { getBindings, getCurrentSession } from "@/modules/identity";
import {
  ROLES,
  ROLE_LABELS,
  getBusiness,
  hasPermission,
  listMembers,
  resolveTenantContext,
} from "@/modules/tenancy";

import {
  changeMemberRoleAction,
  removeMemberAction,
} from "./actions";
import { InviteMemberForm } from "./invite-form";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  recent_auth_required: "For security, sign in again before changing membership.",
  rate_limited: "Too many membership changes. Try again later.",
  invalid_argument: "The request was not valid.",
  forbidden: "You do not have permission to do that.",
  not_found: "That member could not be found.",
  invariant_violation: "A business must retain at least one owner.",
  conflict: "That change conflicts with the current state.",
};

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  const { businessId } = await params;
  if (session === null) {
    redirect(`/sign-in?next=${encodeURIComponent(`/workspace/${businessId}`)}`);
  }

  const { DB } = await getBindings();
  const context = await resolveTenantContext(DB, session.user.id, businessId);
  if (!context.ok) {
    notFound();
  }

  const [business, members] = await Promise.all([
    getBusiness(DB, context.value),
    listMembers(DB, context.value),
  ]);

  if (!business.ok || !members.ok) {
    notFound();
  }

  const canManageMembers = hasPermission(context.value.role, "business.manage_members");
  const canReadAudit = hasPermission(context.value.role, "audit.read");
  const { error } = await searchParams;
  const errorMessage = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;

  const auditEvents = canReadAudit
    ? await listBusinessAuditEvents(DB, context.value.businessId, 25)
    : [];
  const chain = canReadAudit ? await verifyAuditChain(DB) : null;

  return (
    <main className="workspaceShell">
      <header className="siteHeader">
        <Link className="wordmark" href="/workspace">
          Hestian
        </Link>
        <nav className="nav" aria-label="Account">
          <Link href="/workspace">Workspace</Link>
          <span>{ROLE_LABELS[context.value.role]}</span>
          <form action={signOutAction}>
            <button className="linkButton" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <h1 className="pageTitle">{business.value.name}</h1>
      <p className="pageLede">
        Functional currency {business.value.functionalCurrency}. Financial records are not
        implemented in this milestone; this page covers tenancy, membership and the security audit
        trail.
      </p>

      {errorMessage === undefined ? null : (
        <p className="alert alertError" role="alert">
          {errorMessage}
        </p>
      )}

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Members</h2>
          <span className="panelMeta">{members.value.length} active</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Since</th>
              {canManageMembers ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.value.map((member) => (
              <tr key={member.membershipId}>
                <td>
                  {member.name}
                  {canManageMembers ? (
                    <>
                      <br />
                      <span className="businessMeta">{member.email}</span>
                    </>
                  ) : null}
                </td>
                <td>{ROLE_LABELS[member.role]}</td>
                <td>{member.createdAt.slice(0, 10)}</td>
                {canManageMembers ? (
                  <td>
                    <div className="inlineActions">
                      <form action={changeMemberRoleAction}>
                        <input type="hidden" name="businessId" value={context.value.businessId} />
                        <input type="hidden" name="membershipId" value={member.membershipId} />
                        <select
                          className="select"
                          name="role"
                          defaultValue={member.role}
                          aria-label={`Role for ${member.name}`}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        <button className="buttonSecondary" type="submit">
                          Update
                        </button>
                      </form>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="businessId" value={context.value.businessId} />
                        <input type="hidden" name="membershipId" value={member.membershipId} />
                        <button className="linkButton" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canManageMembers ? (
        <section className="panel">
          <div className="panelHead">
            <h2 className="panelTitle">Invite a member</h2>
            <span className="panelMeta">Single-use link, seven days</span>
          </div>
          <InviteMemberForm businessId={context.value.businessId} />
          <p className="hint" style={{ marginTop: 14 }}>
            Email delivery is not configured, so Hestian does not send the invitation. The link is
            shown once and is stored only as a hash.
          </p>
        </section>
      ) : null}

      {canReadAudit ? (
        <section className="panel">
          <div className="panelHead">
            <h2 className="panelTitle">Audit trail</h2>
            <span className="panelMeta">
              {chain === null
                ? "not verified"
                : chain.valid
                  ? `chain verified · ${chain.checked} events`
                  : `chain broken at ${chain.brokenAtSeq ?? "?"}`}
            </span>
          </div>
          {auditEvents.length === 0 ? (
            <p className="emptyState">No audit events recorded for this business yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Action</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Actor</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.occurredAt.replace("T", " ").slice(0, 19)}</td>
                    <td>{event.action}</td>
                    <td>{event.outcome}</td>
                    <td>{event.actorUserId === null ? "system" : event.actorUserId.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <p className="hint" style={{ marginTop: 40 }}>
        Audit events are append-only and hash-chained. The database rejects updates and deletes on
        that table.
      </p>
    </main>
  );
}
