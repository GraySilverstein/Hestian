"use client";

import { useActionState } from "react";

import { IDLE_FORM_STATE } from "../../form-state";
import { deleteAccountAction, requestExportAction } from "./actions";

export function ExportForm() {
  const [state, formAction, pending] = useActionState(requestExportAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.status === "idle" ? null : (
        <p
          className={`alert ${state.status === "error" ? "alertError" : "alertSuccess"}`}
          role="status"
        >
          {state.message}
          {state.status === "success" && state.link !== undefined ? (
            <>
              {" "}
              <a href={state.link}>Download export</a>
            </>
          ) : null}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Generating…" : "Request export"}
      </button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.status === "idle" ? null : (
        <p
          className={`alert ${state.status === "error" ? "alertError" : "alertSuccess"}`}
          role="alert"
        >
          {state.message}
        </p>
      )}
      <div className="field">
        <label className="label" htmlFor="delete-password">
          Current password
        </label>
        <input
          className="input"
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="confirmation">
          Type DELETE to confirm
        </label>
        <input
          className="input"
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          required
          maxLength={6}
        />
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}
