import "dotenv/config";
import { migrate } from "drizzle-orm/mysql2/migrator";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function parseDatabaseUrl(value: string, label: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid database URL.`);
  }
}

function databaseIdentity(url: URL) {
  return [
    url.protocol,
    url.hostname.toLowerCase(),
    url.port || "3306",
    url.pathname.replace(/^\/+/, "").toLowerCase(),
  ].join("|");
}

async function main() {
  const developmentUrlValue = process.env.DATABASE_URL;
  const testUrlValue = process.env.TEST_DATABASE_URL;

  if (process.env.NODE_ENV !== "test") {
    throw new Error("NODE_ENV=test is required to migrate the test database.");
  }

  if (process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") {
    throw new Error(
      "ALLOW_INTEGRATION_TEST_DATABASE=true is required to migrate the test database.",
    );
  }

  if (!testUrlValue) {
    throw new Error("TEST_DATABASE_URL is required to migrate the test database.");
  }

  const testUrl = parseDatabaseUrl(testUrlValue, "TEST_DATABASE_URL");
  const testDatabase = testUrl.pathname.replace(/^\/+/, "").toLowerCase();

  if (!LOCAL_HOSTS.has(testUrl.hostname.toLowerCase())) {
    throw new Error("Refusing to migrate a non-local test database.");
  }

  if (!testDatabase.includes("test")) {
    throw new Error("Refusing to migrate a test database whose name does not include 'test'.");
  }

  if (/prod|production/i.test(testDatabase) || /prod|production/i.test(testUrl.hostname)) {
    throw new Error("Refusing to migrate a production-like test database.");
  }

  if (developmentUrlValue) {
    const developmentUrl = parseDatabaseUrl(developmentUrlValue, "DATABASE_URL");
    if (databaseIdentity(developmentUrl) === databaseIdentity(testUrl)) {
      throw new Error("TEST_DATABASE_URL must not point at the development database.");
    }
  }

  process.env.DATABASE_URL = testUrlValue;

  const { resetEnvForTests } = await import("../src/env");
  resetEnvForTests();

  const { getDb, getPool } = await import("../src/db");
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  await getPool().end();
  console.log("Test database migrations complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
