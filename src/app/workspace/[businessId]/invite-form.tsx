"use client";

import { useActionState } from "react";

import { ROLES, ROLE_LABELS } from "@/modules/tenancy/roles";

import { IDLE_FORM_STATE } from "../../form-state";
import { inviteMemberAction } from "./actions";

export function InviteMemberForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.message === undefined ? null : (
        <p className={`alert ${state.status === "error" ? "alertError" : "alertSuccess"}`} role="status">
          {state.message}
        </p>
      )}
      {state.link === undefined ? null : (
        <div className="tokenBox" aria-label="Invitation link">
          {state.link}
        </div>
      )}
      <input type="hidden" name="businessId" value={businessId} />
      <div className="gridTwo">
        <div className="field">
          <label className="label" htmlFor="invite-email">
            Invitee email
          </label>
          <input
            className="input"
            id="invite-email"
            name="email"
            type="email"
            required
            maxLength={254}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="invite-role">
            Role
          </label>
          <select className="select" id="invite-role" name="role" defaultValue="employee">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Creating invitation…" : "Create invitation"}
      </button>
    </form>
  );
}
