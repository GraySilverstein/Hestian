# 0013 — Multi-factor authentication with TOTP and recovery codes

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Milestone 1 documented MFA as not implemented. Privileged roles (owner,
accountant) will approve and post financial records, so password-only access is not
an adequate ceiling. Custom OTP or secret handling was excluded, as was claiming MFA
without a complete challenge path.

## Decision

1. **Use the provider's two-factor plugin** (Better Auth 1.7.22, `twoFactor`), not a
   hand-built TOTP implementation. It provides TOTP enrolment, signed challenge
   cookies, encrypted secrets, recovery codes and account lockout.
2. **TOTP only.** Email/SMS OTP is not enabled: it depends on delivery that is
   blocked and is weaker than a possession factor. No passkeys yet.
3. **Secrets and recovery codes are encrypted at rest** with the auth secret, not
   stored as plaintext. They are *not* hashed: the provider must be able to display
   recovery codes to their owner and verify TOTP. This is a deliberate, documented
   difference from password hashing; an attacker with the auth secret and database
   could decrypt them, which is why the secret is a platform binding.
4. **Enrolment is two-step.** A password-authenticated, recently-authenticated user
   starts enrolment; the provider returns a TOTP URI and ten recovery codes, shown
   once. The factor is not active until a valid code is confirmed.
5. **A 2FA-enabled account gets no session from a password.** Sign-in returns a
   challenge; the server action redirects to `/two-factor`, which verifies TOTP or a
   recovery code before any session exists. No protected route can be reached in
   between.
6. **Recovery codes are single-use.** The provider consumes a code on success; a
   second attempt fails (tested). Codes are displayed only at issuance.
7. **Disabling requires reauthentication.** The password is required, the session
   must be recent, and every other session is revoked. The provider deletes the
   factor rows and clears `twoFactorEnabled`.
8. **Brute force is limited twice.** The challenge route has an IP fixed-window
   limit, and the plugin enforces account-level lockout (10 failures, 15 minutes)
   because server actions call the API directly and bypass HTTP middleware limits.
9. **Security events are audited:** enrolment started/failed/enabled, challenge
   issued, TOTP failure, recovery used/failed, disabled. Codes and secrets are never
   included.
10. **No bypass routes.** There is no "remember this device" UI, no recovery-code
    bypass, and no alternate sign-in endpoint enabled in this milestone.

## Evidence

`tests/identity/mfa.test.ts` proves enrolment, `twoFactorEnabled`, refusal to create
a session for password-only sign-in, wrong-code rejection, successful challenge,
recovery-code single use, encrypted storage, password-gated disable, and factor
removal. `scripts/verify-runtime.mjs` repeats enrolment, confirmation and challenge
inside workerd (29/29 checks).

## Consequences

**Easier:** one well-reviewed factor implementation, no custom crypto; the challenge
is invisible to every protected route because no session exists until it passes.

**Harder:** losing the authenticator and the recovery codes requires manual support;
there is no self-service identity proofing, and that is stated in the UI.

**Limitations:** TOTP codes are time-step valid, so a code observed and replayed
inside the same 30-second window is accepted (standard TOTP behaviour); there is no
per-code replay cache. No trusted-device or passkey support. No tenant policy yet
requiring owners/accountants to enrol.

## Alternatives considered

- **Custom TOTP.** Rejected: cryptographic and clock-edge cases are easy to get wrong.
- **Email OTP.** Depends on blocked delivery and is weaker.
- **WebAuthn/passkeys.** Better long term; the provider supports it, but it needs
  separate UX and origin testing. Deferred.

## Follow-ups

1. Add a tenant policy requiring MFA for `owner` and `accountant` before financial
   posting exists.
2. Evaluate passkeys and trusted-device cookies with origin testing.
3. Add an administrative recovery process with identity verification and audit.
4. Consider per-code replay prevention if the provider exposes usage tracking.
