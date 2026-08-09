export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./src/env");
    validateEnv();
    const { assertProductionSingleTenantInvariant } = await import(
      "./src/tenancy/safety"
    );
    await assertProductionSingleTenantInvariant();
    const { cleanupExpiredRateLimits } = await import("./src/auth/rate-limit");
    await cleanupExpiredRateLimits();
    const { logOperationalEvent } = await import("./src/lib/logging");
    logOperationalEvent({ action: "application.started" });

    const runtime = globalThis as typeof globalThis & {
      __openersShutdownRegistered?: boolean;
    };
    if (!runtime.__openersShutdownRegistered) {
      runtime.__openersShutdownRegistered = true;
      const shutdown = async (signal: string) => {
        logOperationalEvent({ action: "application.stopping", details: { signal } });
        const { closeDatabasePool } = await import("./src/db");
        await closeDatabasePool();
      };
      process.once("SIGTERM", () => void shutdown("SIGTERM"));
      process.once("SIGINT", () => void shutdown("SIGINT"));
    }
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[]> },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logServerError } = await import("./src/lib/logging");
  const value = request.headers["x-request-id"];
  logServerError({
    requestId: Array.isArray(value) ? value[0] : value,
    action: "request.unhandled_error",
    category: context.routeType,
    entityId: context.routePath,
    error,
  });
}
