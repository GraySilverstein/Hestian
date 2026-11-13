import { getServerEnv } from "@/config/env";
import { toDomainError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { MODULES } from "@/modules/manifest";

export const dynamic = "force-dynamic";

const logger = createLogger({ level: "info", fields: { route: "GET /api/health" } });

interface HealthPayload {
  readonly service: "hestian";
  readonly milestone: 0;
  readonly environment: string;
  readonly modules: { readonly total: number; readonly implemented: number };
}

/**
 * Liveness and configuration check.
 *
 * Returns no tenant data and no configuration values beyond the deployment label.
 * A misconfigured environment fails closed with a generic 500.
 */
export function GET(): Response {
  try {
    const env = getServerEnv();
    const payload: HealthPayload = {
      service: "hestian",
      milestone: 0,
      environment: env.HESTIAN_ENV,
      modules: {
        total: MODULES.length,
        implemented: MODULES.filter((module) => module.status === "implemented").length,
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
