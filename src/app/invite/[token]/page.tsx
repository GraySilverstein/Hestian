import Link from "next/link";

import { getCurrentSession } from "@/modules/identity";

import { AcceptInvitationForm } from "../accept-form";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getCurrentSession();
  const next = `/invite/${token}`;

  return (
    <main className="authShell">
      <Link className="authBrand" href="/">
        Hestian
      </Link>
      <h1 className="authTitle">Business invitation</h1>

      {session === null ? (
        <>
          <p className="authIntro">
            Sign in, or create an account with the invited email address, to accept this invitation.
          </p>
          <div className="inlineActions">
            <Link className="button" href={`/sign-in?next=${encodeURIComponent(next)}`}>
              Sign in
            </Link>
            <Link className="buttonSecondary" href={`/sign-up?next=${encodeURIComponent(next)}`}>
              Create account
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="authIntro">
            You are signed in as {session.user.email}. The invitation is accepted only if this
            address matches the invited address.
          </p>
          <AcceptInvitationForm token={token} />
        </>
      )}
    </main>
  );
}
