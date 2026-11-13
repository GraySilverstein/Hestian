import { recordAuditEvent } from "@/modules/audit";
import { getAuth, getBindings } from "@/modules/identity";

export const dynamic = "force-dynamic";

/**
 * Actions worth auditing when they arrive through the HTTP API rather than a
 * server action. Paths not listed here (session reads, capability probes) are not
 * consequential and would drown the log in noise.
 */
const AUDITED_AUTH_PATHS: Readonly<Record<string, string>> = {
  "/sign-up/email": "identity.sign_up",
  "/sign-in/email": "identity.sign_in",
  "/sign-out": "identity.sign_out",
  "/reset-password": "identity.password_reset",
  "/request-password-reset": "identity.password_reset_requested",
  "/verify-email": "identity.email_verified",
  "/change-password": "identity.password_changed",
  "/revoke-session": "identity.session_revoked",
  "/revoke-sessions": "identity.sessions_revoked",
  "/two-factor/enable": "identity.mfa_enrollment_started",
  "/two-factor/disable": "identity.mfa_disabled",
  "/two-factor/verify-totp": "identity.mfa_verified",
  "/two-factor/verify-backup-code": "identity.mfa_recovery_used",
  "/two-factor/generate-backup-codes": "identity.mfa_recovery_regenerated",
};

async function auditRequest(request: Request, response: Response): Promise<void> {
  const { pathname } = new URL(request.url);
  const action = AUDITED_AUTH_PATHS[pathname.replace(/^\/api\/auth/, "")];
  if (action === undefined) return;

  try {
    const { DB } = await getBindings();
    await recordAuditEvent(DB, {
      action,
      outcome: response.ok ? "success" : "failure",
      correlationId: crypto.randomUUID(),
      metadata: { status: response.status },
    });
  } catch {
    // The auth response stands; the audit gap is visible through chain checks.
  }
}

async function handle(request: Request): Promise<Response> {
  const auth = await getAuth();
  const response = await auth.handler(request);
  await auditRequest(request, response);
  return response;
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
