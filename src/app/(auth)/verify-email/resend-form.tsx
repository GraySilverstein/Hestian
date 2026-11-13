"use client";

import { useActionState } from "react";

import { IDLE_FORM_STATE } from "../../form-state";
import { resendVerificationAction } from "../actions";

export function ResendVerificationForm() {
  const [state, formAction, pending] = useActionState(resendVerificationAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.status === "idle" || state.message === undefined ? null : (
        <p className="alert alertSuccess" role="status">
          {state.message}
        </p>
      )}
      <div className="field">
        <label className="label" htmlFor="verify-email">
          Email
        </label>
        <input
          className="input"
          id="verify-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Resend verification email"}
      </button>
    </form>
  );
}
