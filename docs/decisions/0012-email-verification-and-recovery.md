# 0012 — Email verification, recovery and fail-closed delivery

- **Status:** Accepted
- **Date:** 2026-11-13
- **Delivery status:** BLOCKED on provider credentials (code and tests complete)

## Context

Milestone 1 issued verification and reset tokens but had no transport, so no
message could be sent and accounts stayed unverified. The milestone brief requires
a production-capable architecture without inventing a provider account, and it
requires production to fail closed where verification is required.

## Decision

1. **One provider-independent port.** `Mailer.send(EmailMessage)` is the only way
   the identity module sends mail. Auth configuration receives a `Mailer`, never a
   provider SDK or key.
2. **One HTTP adapter.** `createMailer()` posts to the Resend API when both
   `RESEND_API_KEY` and `EMAIL_FROM` bindings exist. No SDK dependency is added for
   a single POST. Provider errors are mapped to `provider_error` without leaking the
   response body.
3. **Honest unconfigured state.** Without credentials the port returns
   `delivered: false, reason: "unconfigured"`. The outcome is logged without the
   recipient, token or message body, and audit records show no delivery claim.
4. **Tokens never enter logs or analytics.** Message bodies (which contain the
   single-use link) are not logged. Reset links carry the token in the path; the
   application never echoes it.
5. **Verification is enforced by configuration, not UI.** `EMAIL_VERIFICATION_REQUIRED`
   is `true` in production unless explicitly set to `"false"`; the provider then
   refuses to create a session for an unverified account. In development it
   defaults to off so accounts are usable without a transport.
6. **Single-use and expiry belong to the provider.** Verification tokens are signed
   JWTs with an `exp` claim; reset tokens are stored server-side and consumed
   atomically. Replay is rejected (tested), and expired JWTs are rejected (tested).
7. **Resend throttling is ours.** `resendVerificationAction` applies a fixed-window
   limit keyed by normalised email (2 per 5 minutes) before calling the provider,
   and always returns the same message so it cannot enumerate accounts.
8. **Password reset revokes sessions.** A provider hook (`onPasswordReset`) deletes
   every session for the user, so a stolen session cannot outlive the credential
   change.
9. **No fake verification.** There is no bypass flag, no auto-verified development
   account, and no "email sent" message without a transport result.

## Evidence

`tests/identity/email-verification.test.ts` proves: fail-closed sign-in before
verification, successful verification, replay returning no user, expired JWT
rejection, reset single-use, session revocation after reset, and uniform responses
for unknown addresses. The runtime script exercises sign-up and session behaviour
in workerd; it cannot exercise delivery because no key exists.

## Consequences

**Easier:** swapping providers means implementing one interface. The same code is
tested with a capturing mailer and deployed with Resend.

**Harder:** enabling verification in production before setting secrets will lock
new accounts out. That is the intended fail-closed behaviour, and deployment must
set the mail secrets first.

**Blocked:** real delivery, sender-domain authentication (SPF/DKIM/DMARC), bounce
handling, and production enforcement are untestable until an account exists.

## Alternatives considered

- **Provider SDK.** Adds weight and a second runtime compatibility risk for one POST.
- **Cloudflare Email Workers / SendEmail binding.** Requires a verified domain and
  account configuration that does not exist; the port leaves this open.
- **Disabling verification everywhere.** Rejected: unverified addresses would own
  financial tenancy.

## Follow-ups

1. Create the provider account, verify a sender domain, set the bindings, and rerun
   the flow against a real inbox.
2. Configure SPF/DKIM/DMARC and a bounce/complaint policy.
3. Turn on `EMAIL_VERIFICATION_REQUIRED` in production and test sign-in refusal.
4. Decide what happens to unverified accounts after a retention window.
