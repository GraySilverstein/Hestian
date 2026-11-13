"use client";

import { useActionState } from "react";

import { IDLE_FORM_STATE } from "../form-state";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.message === undefined ? null : (
        <p className={`alert ${state.status === "error" ? "alertError" : "alertSuccess"}`} role="status">
          {state.message}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </button>
      <p className="hint">
        The invitation must be accepted by the account registered to the invited email address.
      </p>
    </form>
  );
}
