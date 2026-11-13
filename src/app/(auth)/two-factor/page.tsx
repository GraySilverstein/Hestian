import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/identity";

import { safeNextPath } from "../../form-state";
import { TwoFactorForm } from "./two-factor-form";

export const dynamic = "force-dynamic";

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentSession();
  const { next } = await searchParams;
  const target = safeNextPath(next);

  if (session !== null) {
    redirect(target);
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <Link className="wordmark" href="/">
          Hestian
        </Link>
        <h1 className="pageTitle">Two-factor verification</h1>
        <p className="pageLede">
          Your account is protected with a second factor. Enter the current code to finish signing in.
        </p>
        <TwoFactorForm next={target} />
        <p className="hint">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
