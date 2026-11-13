import Link from "next/link";
import { redirect } from "next/navigation";

import { getBindings, getCurrentSession } from "@/modules/identity";

import { DeleteAccountForm, ExportForm } from "./privacy-forms";

export const dynamic = "force-dynamic";

interface ExportRow {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  ready: "Ready",
  downloaded: "Downloaded",
  expired: "Expired",
};

export default async function PrivacySettingsPage() {
  const session = await getCurrentSession();
  if (session === null) {
    redirect("/sign-in?next=/settings/privacy");
  }

  const { DB } = await getBindings();
  const exports = await DB.prepare(
    `SELECT id, status, created_at, expires_at
       FROM governance_data_export
      WHERE requested_by_user_id = ?
      ORDER BY created_at DESC
      LIMIT 10`,
  )
    .bind(session.user.id)
    .all<ExportRow>();

  const now = Date.now();

  return (
    <main className="workspaceShell">
      <header className="siteHeader">
        <Link className="wordmark" href="/">
          Hestian
        </Link>
        <nav className="nav" aria-label="Settings">
          <Link href="/workspace">Workspace</Link>
          <Link href="/settings/security">Security</Link>
        </nav>
      </header>

      <h1 className="pageTitle">Privacy</h1>
      <p className="pageLede">
        Export the personal data you are authorized to see, or delete your identity. Business
        records and audit history are not silently destroyed with your account.
      </p>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Your data export</h2>
          <span className="panelMeta">Expires after one hour</span>
        </div>
        <p className="hint" style={{ marginBottom: 16 }}>
          Includes your profile, your business memberships and session timestamps. It excludes other
          people&apos;s details, tenant records and credentials. Downloads require your signed-in
          session; there is no public link.
        </p>
        <ExportForm />
        {exports.results.length === 0 ? (
          <p className="emptyState">No exports yet.</p>
        ) : (
          <ul className="businessList">
            {exports.results.map((row) => {
              const expired = Date.parse(row.expires_at) <= now;
              return (
                <li className="businessItem" key={row.id}>
                  <span className="businessName">
                    {new Date(row.created_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC
                  </span>
                  <span className="businessMeta">
                    {expired ? "Expired" : (STATUS_LABELS[row.status] ?? row.status)}{" "}
                    {expired ? null : (
                      <a href={`/api/privacy/export/${row.id}`}>Download</a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Delete your account</h2>
          <span className="panelMeta">Irreversible</span>
        </div>
        <p className="hint" style={{ marginBottom: 16 }}>
          Deletes your credentials, sessions, second factor, memberships and pending invitations, and
          anonymises your profile. Audit events are retained for integrity and security. If you are
          the sole owner of a business, deletion is blocked until ownership is transferred; that
          workflow does not exist yet. No legal retention period has been fixed, and this is not a
          compliance claim.
        </p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}
