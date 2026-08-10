import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  return Response.json(
    {
      version: env.APP_VERSION,
      commit: env.GIT_COMMIT_SHA?.slice(0, 40) ?? "unknown",
      environment: env.DEPLOYMENT_ENVIRONMENT ?? env.NODE_ENV,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
