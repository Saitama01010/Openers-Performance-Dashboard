export type DatabaseEnvironment =
  | "development"
  | "test"
  | "preview"
  | "production";

const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mysql"]);

export type RemediationDatabaseClassification =
  | "local development"
  | "isolated test"
  | "preview"
  | "production"
  | "unknown";

export function classifyRemediationDatabase(input: {
  databaseUrl?: string;
  databaseEnvironment?: string;
  deploymentEnvironment?: string;
}): RemediationDatabaseClassification {
  if (
    input.databaseEnvironment === "production" ||
    input.deploymentEnvironment === "production"
  ) return "production";
  if (
    input.databaseEnvironment === "preview" ||
    input.deploymentEnvironment === "preview"
  ) return "preview";
  if (!input.databaseUrl) return "unknown";

  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    return "unknown";
  }
  const host = url.hostname.toLocaleLowerCase("en-US");
  const databaseName = url.pathname.replace(/^\//, "").toLocaleLowerCase("en-US");
  if (!LOCAL_TEST_HOSTS.has(host)) return "unknown";
  if (
    input.databaseEnvironment === "development" &&
    input.deploymentEnvironment === "development"
  ) return "local development";
  if (
    input.databaseEnvironment === "test" &&
    input.deploymentEnvironment === "test" &&
    /(^|[_-])test($|[_-])/.test(databaseName)
  ) return "isolated test";
  return "unknown";
}

export function assertApprovedRemediationEnvironment(input: {
  approvedEnvironment?: string;
  databaseUrl?: string;
  databaseEnvironment?: string;
  deploymentEnvironment?: string;
}) {
  const classification = classifyRemediationDatabase(input);
  const expectedApproval = {
    "local development": "development",
    "isolated test": "test",
    preview: "preview",
    production: "production",
    unknown: null,
  }[classification];
  if (!expectedApproval) {
    throw new Error("The database environment cannot be safely classified.");
  }
  if (input.approvedEnvironment !== expectedApproval) {
    throw new Error(
      `Execution requires --approved-environment ${expectedApproval}.`,
    );
  }
  return classification;
}

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
