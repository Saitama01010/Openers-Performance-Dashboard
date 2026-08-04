import "dotenv/config";

import { assertSafeTestDatabase } from "@/db/safety";

assertSafeTestDatabase({
  databaseUrl: process.env.DATABASE_URL,
  databaseEnvironment: process.env.DATABASE_ENVIRONMENT,
  nodeEnvironment: "test",
});
