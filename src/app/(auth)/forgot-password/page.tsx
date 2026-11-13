import Link from "next/link";

import { ForgotPasswordForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="authShell">
      <Link className="authBrand" href="/">
        Hestian
      </Link>
      <h1 className="authTitle">Reset password</h1>
      <p className="authIntro">
        Enter your account email. The response is identical whether or not the address is
        registered, so this page cannot be used to discover accounts.
      </p>
      <ForgotPasswordForm />
      <p className="hint" style={{ marginTop: 24 }}>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  );
}
