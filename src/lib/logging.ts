import { randomUUID } from "node:crypto";

import { redactSecrets } from "@/lib/redaction";

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
