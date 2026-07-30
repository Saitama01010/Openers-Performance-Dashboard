import "dotenv/config";

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

function assertLocalTestDatabase(url: URL) {
  const database = url.pathname.replace(/^\/+/, "").toLowerCase();

  if (process.env.NODE_ENV !== "test") {
    throw new Error("Integration tests require NODE_ENV=test.");
  }

  if (process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") {
    throw new Error(
      "Integration tests require ALLOW_INTEGRATION_TEST_DATABASE=true.",
    );
  }

  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Integration tests require a local TEST_DATABASE_URL host.");
  }

  if (!database.includes("test")) {
    throw new Error(
      "Integration tests require TEST_DATABASE_URL to point at a database whose name includes 'test'.",
    );
  }

  if (/prod|production/i.test(database) || /prod|production/i.test(url.hostname)) {
    throw new Error("Integration tests refuse to run against production-like databases.");
  }
}

const configuredDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "Integration tests require TEST_DATABASE_URL. Refusing to use the development DATABASE_URL.",
  );
}

const testUrl = parseDatabaseUrl(testDatabaseUrl, "TEST_DATABASE_URL");
assertLocalTestDatabase(testUrl);

if (configuredDatabaseUrl) {
  const developmentUrl = parseDatabaseUrl(configuredDatabaseUrl, "DATABASE_URL");

  if (databaseIdentity(developmentUrl) === databaseIdentity(testUrl)) {
    throw new Error(
      "Integration tests require TEST_DATABASE_URL to be different from DATABASE_URL.",
    );
  }
}

process.env.DATABASE_URL = testDatabaseUrl;
