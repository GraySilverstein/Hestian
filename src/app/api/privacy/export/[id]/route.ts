import { loadExport } from "@/modules/governance";
import { getBindings, getSession } from "@/modules/identity";

export const dynamic = "force-dynamic";

/**
 * Serves a previously generated personal export.
 *
 * Authorization is the signed-in session, not the id: the export row is looked up
 * with `requested_by_user_id = session.user.id`, so guessing an id yields nothing.
 * The response is never cached and is delivered as an attachment.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession(request.headers);
  if (session === null) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  if (typeof id !== "string" || id.length > 64) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { DB } = await getBindings();
  const result = await loadExport(DB, id, session.user.id);
  if (!result.ok) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return new Response(result.value.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="hestian-export-${id}.json"`,
      "cache-control": "no-store",
    },
  });
}
