import { checkDatabaseReadiness } from "@/db";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const env = getEnv();
    await checkDatabaseReadiness();
    return Response.json(
      { status: "ready", environment: env.DEPLOYMENT_ENVIRONMENT ?? env.NODE_ENV },
      { status: 200, headers: HEADERS },
    );
  } catch {
    return Response.json(
      { status: "not_ready", reason: "dependency_unavailable" },
      { status: 503, headers: HEADERS },
    );
  }
}
