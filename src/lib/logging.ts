import { randomUUID } from "node:crypto";

import { redactSecrets } from "@/lib/redaction";

type OperationalEvent = {
  requestId?: string;
  action: string;
  actorId?: string | null;
  organizationId?: string | null;
  entityId?: string | null;
  durationMs?: number;
  details?: Record<string, unknown>;
};

export function requestId(request?: Request) {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : randomUUID();
}

export function logServerError(input: {
  requestId?: string;
  action: string;
  actorId?: string | null;
  entityId?: string | null;
  category: string;
  error: unknown;
}) {
  const error = input.error instanceof Error ? input.error : new Error("Unknown error");
  console.error(
    JSON.stringify(
      redactSecrets({
        level: "error",
        requestId: input.requestId ?? randomUUID(),
        action: input.action,
        actorId: input.actorId ?? null,
        entityId: input.entityId ?? null,
        category: input.category,
        error: { name: error.name, message: error.message, stack: error.stack },
      }),
    ),
  );
}

export function logOperationalEvent(input: OperationalEvent) {
  console.info(
    JSON.stringify(
      redactSecrets({
        level: "info",
        requestId: input.requestId ?? randomUUID(),
        action: input.action,
        actorId: input.actorId ?? null,
        organizationId: input.organizationId ?? null,
        entityId: input.entityId ?? null,
        durationMs: input.durationMs,
        details: input.details ?? {},
      }),
    ),
  );
}
