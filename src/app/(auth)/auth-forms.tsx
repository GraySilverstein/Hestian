"use client";

import Link from "next/link";
import { useActionState } from "react";

import { IDLE_FORM_STATE } from "../form-state";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "./actions";

function Alert({ status, message }: { status: string; message: string | undefined }) {
  if (status === "idle" || message === undefined) return null;
  return (
    <p className={`alert ${status === "error" ? "alertError" : "alertSuccess"}`} role="status">
      {message}
    </p>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      <Alert status={state.status} message={state.message} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="hint">
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      <Alert status={state.status} message={state.message} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="name">
          Name
        </label>
        <input
          className="input"
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
        <span className="hint">At least 12 characters. Use a password manager.</span>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      <Alert status={state.status} message={state.message} />
      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Requesting…" : "Request reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      <Alert status={state.status} message={state.message} />
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
        <span className="hint">At least 12 characters.</span>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
