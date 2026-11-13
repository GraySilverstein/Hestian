"use client";

import { useActionState } from "react";

import { IDLE_FORM_STATE } from "../../form-state";
import { verifyTwoFactorAction } from "./actions";

export function TwoFactorForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.status === "error" && state.message !== undefined ? (
        <p className="alert alertError" role="alert">
          {state.message}
        </p>
      ) : null}
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="code">
          Authentication code
        </label>
        <input
          className="input"
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          minLength={6}
          maxLength={32}
        />
        <span className="hint">A 6-digit code from your authenticator app, or a recovery code.</span>
      </div>
      <label className="hint" htmlFor="useRecoveryCode">
        <input id="useRecoveryCode" name="useRecoveryCode" type="checkbox" /> Use a recovery code
      </label>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
