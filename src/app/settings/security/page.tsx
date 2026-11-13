import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/identity";

import { DisableMfaForm, EnrollmentForm } from "./mfa-forms";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const session = await getCurrentSession();
  if (session === null) {
    redirect("/sign-in?next=/settings/security");
  }

  return (
    <main className="workspaceShell">
      <header className="siteHeader">
        <Link className="wordmark" href="/">
          Hestian
        </Link>
        <nav className="nav" aria-label="Settings">
          <Link href="/workspace">Workspace</Link>
          <Link href="/settings/privacy">Privacy</Link>
        </nav>
      </header>

      <h1 className="pageTitle">Security</h1>
      <p className="pageLede">
        Two-factor authentication is enforced server-side. A password alone will not create a session
        once an authenticator is enrolled.
      </p>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Authenticator app</h2>
          <span className="panelMeta">
            {session.user.twoFactorEnabled ? "Enabled" : "Not enabled"}
          </span>
        </div>
        <EnrollmentForm enabled={session.user.twoFactorEnabled} />
      </section>

      {session.user.twoFactorEnabled ? (
        <section className="panel">
          <div className="panelHead">
            <h2 className="panelTitle">Disable two-factor authentication</h2>
            <span className="panelMeta">Requires password</span>
          </div>
          <DisableMfaForm />
        </section>
      ) : null}

      <p className="hint" style={{ marginTop: 40 }}>
        Recovery codes are stored encrypted by the authentication provider, not as plaintext. Each
        code can be used once. If you lose both the authenticator and the codes, account recovery is
        manual and not yet automated.
      </p>
    </main>
  );
}
