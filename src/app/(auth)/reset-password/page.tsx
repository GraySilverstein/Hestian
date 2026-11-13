import Link from "next/link";

import { ResetPasswordForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="authShell">
      <Link className="authBrand" href="/">
        Hestian
      </Link>
      <h1 className="authTitle">Choose a new password</h1>
      {typeof token === "string" && token.length > 0 ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="alert alertError">
          This page needs a valid reset token. Request a new link from the{" "}
          <Link href="/forgot-password">password reset page</Link>.
        </p>
      )}
    </main>
  );
}
