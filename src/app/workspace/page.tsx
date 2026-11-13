import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction, signOutEverywhereAction } from "@/app/(auth)/actions";
import { getBindings, getCurrentSession } from "@/modules/identity";
import { ROLE_LABELS, listBusinessesForUser } from "@/modules/tenancy";

import { CreateBusinessForm } from "./create-business-form";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  recent_auth_required: "For security, sign in again before changing membership.",
  not_found: "That business could not be found.",
  rate_limited: "Too many attempts. Try again later.",
  invalid_request: "The request was not valid.",
  for: "You do not have permission to do that.",
  invariant_violation: "A business must retain at least one owner.",
  conflict: "That change conflicts with the current state.",
};

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (session === null) {
    redirect("/sign-in?next=/workspace");
  }

  const { error } = await searchParams;
  const errorMessage = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;

  const { DB } = await getBindings();
  const businesses = await listBusinessesForUser(DB, session.user.id);

  return (
    <main className="workspaceShell">
      <header className="siteHeader">
        <Link className="wordmark" href="/">
          Hestian
        </Link>
        <nav className="nav" aria-label="Account">
          <span>{session.user.email}</span>
          <form action={signOutEverywhereAction}>
            <button className="linkButton" type="submit">
              Sign out everywhere
            </button>
          </form>
          <form action={signOutAction}>
            <button className="linkButton" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <h1 className="pageTitle">Workspace</h1>
      <p className="pageLede">
        Businesses you belong to. Roles are enforced on the server for every request; the interface
        only reflects what your membership allows.
      </p>

      {errorMessage === undefined ? null : (
        <p className="alert alertError" role="alert">
          {errorMessage}{" "}
          {error === "recent_auth_required" ? (
            <Link href="/sign-in?next=/workspace">Sign in again</Link>
          ) : null}
        </p>
      )}

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Your businesses</h2>
          <span className="panelMeta">{businesses.length} total</span>
        </div>
        {businesses.length === 0 ? (
          <p className="emptyState">No businesses yet. Create one to begin.</p>
        ) : (
          <ul className="businessList">
            {businesses.map((business) => (
              <li className="businessItem" key={business.id}>
                <Link className="businessName" href={`/workspace/${business.id}`}>
                  {business.name}
                </Link>
                <span className="businessMeta">
                  {ROLE_LABELS[business.role]} · {business.functionalCurrency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Create a business</h2>
          <span className="panelMeta">You become the owner</span>
        </div>
        <CreateBusinessForm />
      </section>

      <p className="hint" style={{ marginTop: 40 }}>
        No financial records, journals or balances exist in this milestone. Creating a business
        creates only a tenant and your owner membership.
      </p>
    </main>
  );
}
