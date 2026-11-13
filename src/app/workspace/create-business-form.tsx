"use client";

import { useActionState } from "react";

import { CURRENCIES } from "@/core/money";

import { IDLE_FORM_STATE } from "../form-state";
import { createBusinessAction } from "./actions";

const CURRENCY_CODES = Object.keys(CURRENCIES);

export function CreateBusinessForm() {
  const [state, formAction, pending] = useActionState(createBusinessAction, IDLE_FORM_STATE);

  return (
    <form className="form" action={formAction}>
      {state.message === undefined ? null : (
        <p className={`alert ${state.status === "error" ? "alertError" : "alertSuccess"}`} role="status">
          {state.message}
        </p>
      )}
      <div className="gridTwo">
        <div className="field">
          <label className="label" htmlFor="business-name">
            Business name
          </label>
          <input
            className="input"
            id="business-name"
            name="name"
            type="text"
            required
            maxLength={120}
            autoComplete="organization"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="business-currency">
            Functional currency
          </label>
          <select className="select" id="business-currency" name="currency" defaultValue="USD">
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create business"}
      </button>
    </form>
  );
}
