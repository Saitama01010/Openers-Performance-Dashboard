export type DatabaseEnvironment =
  | "development"
  | "test"
  | "preview"
  | "production";

const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mysql"]);

export function testDatabaseSafetyError(input: {
  databaseUrl?: string;
  databaseEnvironment?: string;
  nodeEnvironment?: string;
}) {
  if (input.nodeEnvironment !== "test" || !input.databaseUrl) return null;

  if (input.databaseEnvironment !== "test") {
    return "Tests require DATABASE_ENVIRONMENT=test; refusing to use a database that is not explicitly marked as test.";
  }

  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    return "Tests require a valid DATABASE_URL.";
  }

  const databaseName = url.pathname.replace(/^\//, "").toLocaleLowerCase("en-US");
  if (!LOCAL_TEST_HOSTS.has(url.hostname.toLocaleLowerCase("en-US"))) {
    return "Tests may only connect to an isolated local or CI database host; refusing a remote database.";
  }
  if (!/(^|[_-])test($|[_-])/.test(databaseName)) {
    return "The test database name must contain a standalone 'test' marker; refusing a database that may be production.";
  }

  return null;
}

export function assertSafeTestDatabase(input: {
  databaseUrl?: string;
  databaseEnvironment?: string;
  nodeEnvironment?: string;
}) {
  const error = testDatabaseSafetyError(input);
  if (error) throw new Error(error);
}
