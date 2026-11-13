import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/identity";

import { safeNextPath } from "../../form-state";
import { SignUpForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
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
      <h1 className="authTitle">Create account</h1>
      <p className="authIntro">
        Hestian is in foundation development. Accounts created now have no financial data and no
        connected integrations.
      </p>
      <SignUpForm next={next} />
      <p className="hint" style={{ marginTop: 24 }}>
        Already registered? <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>
      </p>
    </main>
  );
}
