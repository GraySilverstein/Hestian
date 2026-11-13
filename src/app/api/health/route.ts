import { getServerEnv } from "@/config/env";
import { toDomainError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { MODULES } from "@/modules/manifest";
import { getBindings } from "@/modules/identity";

export const dynamic = "force-dynamic";

const logger = createLogger({ level: "info", fields: { route: "GET /api/health" } });

interface HealthPayload {
  readonly service: "hestian";
  readonly milestone: 1;
  readonly environment: string;
  readonly modules: { readonly total: number; readonly implemented: number };
  readonly dependencies: {
    readonly database: "ok" | "unavailable";
    readonly authentication: "configured" | "unconfigured";
  };
}

async function databaseStatus(): Promise<"ok" | "unavailable"> {
  try {
    const { DB } = await getBindings();
    const row = await DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return row?.ok === 1 ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Liveness and configuration check.
 *
 * Exposes no tenant data and no secret values: only whether persistence and
 * authentication are configured. A misconfigured environment fails closed.
 */
export async function GET(): Promise<Response> {
  try {
    const env = getServerEnv();
    const { BETTER_AUTH_SECRET } = await getBindings();

    const payload: HealthPayload = {
      service: "hestian",
      milestone: 1,
      environment: env.HESTIAN_ENV,
      modules: {
        total: MODULES.length,
        implemented: MODULES.filter((module) => module.status === "implemented").length,
      },
      dependencies: {
        database: await databaseStatus(),
        authentication:
          (BETTER_AUTH_SECRET ?? "").length >= 32 ? "configured" : "unconfigured",
      },
    };

    return Response.json(payload, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const domainError = toDomainError(error);
    logger.error("health.configuration_invalid", {
      code: domainError.code,
      details: domainError.details,
    });

    return Response.json(
      { service: "hestian", status: "unavailable", code: domainError.code },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
