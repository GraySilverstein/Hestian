import Link from "next/link";

import { ResendVerificationForm } from "./resend-form";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <main className="authShell">
      <Link className="authBrand" href="/">
        Hestian
      </Link>
      <h1 className="authTitle">Verify your email</h1>
      <p className="authIntro">
        Verification links are single-use and expire after one hour. If your link expired, request a
        new one. The response is the same whether or not an account exists, so this page cannot be
        used to discover addresses.
      </p>
      <ResendVerificationForm />
      <p className="hint" style={{ marginTop: 24 }}>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  );
}
