import "server-only";

import { logServerError } from "@/lib/logging";

export interface ErrorTracker {
  capture(error: unknown, context: {
    requestId?: string;
    action: string;
    actorId?: string | null;
    entityId?: string | null;
    category: string;
  }): Promise<void> | void;
}

class StructuredLogErrorTracker implements ErrorTracker {
  capture(error: unknown, context: Parameters<typeof logServerError>[0]) {
    logServerError({ ...context, error });
  }
}

let tracker: ErrorTracker = new StructuredLogErrorTracker();

export function configureErrorTracker(nextTracker: ErrorTracker) {
  tracker = nextTracker;
}

export function captureOperationalError(
  error: unknown,
  context: {
    requestId?: string;
    action: string;
    actorId?: string | null;
    entityId?: string | null;
    category: string;
  },
) {
  return tracker.capture(error, context);
}
