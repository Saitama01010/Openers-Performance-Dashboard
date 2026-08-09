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
  }
}
