import { enforceRateLimit } from "@/core/rate-limit";
import { exportBusinessAuditEvents, verifyAuditChain } from "@/modules/audit";
import { getBindings, getSession } from "@/modules/identity";
import { authorize, resolveTenantContext } from "@/modules/tenancy";

export const dynamic = "force-dynamic";

/**
 * Exports one business's audit trail with its hash-chain fields.
 *
 * Requires a session, an active membership, and `audit.read` in that business.
 * The global chain status is included as a boolean so the recipient can tell
 * whether the stored chain currently verifies; it exposes no other tenant data.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession(request.headers);
  if (session === null) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  if (businessId === null) {
    return Response.json({ error: "A business is required." }, { status: 400 });
  }

  const { DB } = await getBindings();
  const limited = await enforceRateLimit(DB, `audit:export:${session.user.id}`, {
    windowSeconds: 60 * 60,
    max: 10,
  });
  if (!limited.ok) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const context = await resolveTenantContext(DB, session.user.id, businessId);
  if (!context.ok) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const permitted = authorize(context.value, "audit.read");
  if (!permitted.ok) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const [events, chain] = await Promise.all([
    exportBusinessAuditEvents(DB, context.value.businessId),
    verifyAuditChain(DB),
  ]);

  return Response.json(
    {
      businessId: context.value.businessId,
      exportedAt: new Date().toISOString(),
      chain,
      events,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
