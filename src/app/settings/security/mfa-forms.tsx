"use client";

import { useActionState } from "react";

import { IDLE_FORM_STATE } from "../../form-state";
import {
  confirmEnrollmentAction,
  disableMfaAction,
  startEnrollmentAction,
  type EnrollmentState,
} from "./actions";

const IDLE_ENROLLMENT: EnrollmentState = IDLE_FORM_STATE;

function Alert({ status, message }: { status: string; message: string | undefined }) {
  if (status === "idle" || message === undefined) return null;
  return (
    <p className={`alert ${status === "error" ? "alertError" : "alertSuccess"}`} role="status">
      {message}
    </p>
  );
}

export function EnrollmentForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(startEnrollmentAction, IDLE_ENROLLMENT);
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmEnrollmentAction,
    IDLE_ENROLLMENT,
  );

  if (enabled) {
    return (
      <p className="hint">
        An authenticator is enrolled. Disabling requires your password and recent sign-in.
      </p>
    );
  }

  return (
    <div>
      <Alert status={state.status} message={state.message} />
      {state.totpUri === undefined ? (
        <form className="form" action={formAction}>
          <div className="field">
            <label className="label" htmlFor="mfa-password">
              Current password
            </label>
            <input
              className="input"
              id="mfa-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </div>
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Starting…" : "Set up authenticator"}
          </button>
        </form>
      ) : (
        <div>
          <div className="field">
            <p className="label">Authenticator setup key</p>
            <code className="codeBlock">{state.totpUri}</code>
            <span className="hint">
              Add this to your authenticator app. The secret is shown only on this screen.
            </span>
          </div>
          <div className="field">
            <p className="label">Recovery codes (store them offline)</p>
            <ul className="bareList">
              {state.backupCodes?.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <span className="hint">
              Each code works once. They are stored encrypted and cannot be shown again.
            </span>
          </div>
          <Alert status={confirmState.status} message={confirmState.message} />
          <form className="form" action={confirmAction}>
            <div className="field">
              <label className="label" htmlFor="mfa-code">
                Code from the app
              </label>
              <input
                className="input"
                id="mfa-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={32}
              />
            </div>
            <button className="button" type="submit" disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm and enable"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function DisableMfaForm() {
  const [state, formAction, pending] = useActionState(disableMfaAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      <Alert status={state.status} message={state.message} />
      <div className="field">
        <label className="label" htmlFor="disable-password">
          Current password
        </label>
        <input
          className="input"
          id="disable-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <span className="hint">Disabling revokes every other session.</span>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Disabling…" : "Disable two-factor authentication"}
      </button>
    </form>
  );
}
