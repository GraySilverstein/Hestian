import type { ZodType } from "zod";

import { DomainError, httpStatusFor, isDomainError } from "@/core/errors";
import { err, ok, type Result } from "@/core/result";

/** Hard ceiling for JSON request bodies handled by Hestian. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

/**
 * Same-origin check for state-changing requests.
 *
 * Missing `Origin` fails closed. A request is same-origin when it arrives on the
 * same host as the deployment, or the origin is explicitly trusted.
 */
export function isSameOrigin(
  request: Request,
  trustedOrigins: readonly string[] = [],
): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;

  let parsedOrigin: URL;
  let requestUrl: URL;
  try {
    parsedOrigin = new URL(origin);
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  if (parsedOrigin.host === requestUrl.host) return true;
  return trustedOrigins.includes(parsedOrigin.origin);
}

export function assertSameOrigin(
  request: Request,
  trustedOrigins: readonly string[] = [],
): Result<void, DomainError> {
  if (!isSameOrigin(request, trustedOrigins)) {
    return err(
      new DomainError({
        code: "FORBIDDEN",
        message: "Cross-origin request rejected.",
      }),
    );
  }
  return ok(undefined);
}

/**
 * Parses a JSON request body against a schema.
 *
 * Enforces method, content type, size and shape before any business logic runs.
 * Validation errors report field paths only — never the received values.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options: { readonly maxBytes?: number } = {},
): Promise<Result<T, DomainError>> {
  const maxBytes = options.maxBytes ?? MAX_JSON_BODY_BYTES;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return err(
      new DomainError({
        code: "INVALID_ARGUMENT",
        message: "Content-Type must be application/json.",
      }),
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return err(
      new DomainError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large.",
      }),
    );
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return err(new DomainError({ code: "INVALID_ARGUMENT", message: "Body could not be read." }));
  }

  if (text.length > maxBytes) {
    return err(
      new DomainError({ code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." }),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err(new DomainError({ code: "INVALID_ARGUMENT", message: "Body is not valid JSON." }));
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return err(
      new DomainError({
        code: "INVALID_ARGUMENT",
        message: "Request body failed validation.",
        details: {
          fields: validated.error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
        },
      }),
    );
  }

  return ok(validated.data);
}

/** Uniform JSON error response. Messages are curated; no stack traces escape. */
export function errorResponse(error: unknown): Response {
  const domainError = isDomainError(error)
    ? error
    : new DomainError({ code: "INTERNAL", message: "An unexpected error occurred." });

  return Response.json(
    { error: { code: domainError.code, message: domainError.message } },
    {
      status: httpStatusFor(domainError.code),
      headers: { "cache-control": "no-store" },
    },
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
