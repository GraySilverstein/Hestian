import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/identity";

import { safeNextPath } from "../../form-state";
import { SignInForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const next = params.invite ? `/invite/${params.invite}` : safeNextPath(params.next);
  const session = await getCurrentSession();

  if (session !== null) {
    redirect(next);
  }

  return (
    <main className="authShell">
      <Link className="authBrand" href="/">
        Hestian
      </Link>
      <h1 className="authTitle">Sign in</h1>
      <p className="authIntro">
        Access your business workspace. Sessions are server-verified, expire after eight hours, and
        can be revoked at any time.
      </p>
      <SignInForm next={next} />
      <p className="hint" style={{ marginTop: 24 }}>
        No account?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>Create one</Link>
        {" · "}
        <Link href="/verify-email">Resend verification email</Link>
      </p>
    </main>
  );
}
