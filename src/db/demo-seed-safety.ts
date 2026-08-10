const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mysql"]);
const PUBLIC_DEMO_PASSWORDS = new Set([
  "password123!",
  "changeme123!",
  "admin123456!",
]);

export function demoSeedSafetyError(source: NodeJS.ProcessEnv) {
  if (source.ALLOW_DESTRUCTIVE_DEMO_SEED !== "true") {
    return "Demo seed requires ALLOW_DESTRUCTIVE_DEMO_SEED=true.";
  }
  if (source.NODE_ENV === "production") {
    return "Demo seed is prohibited when NODE_ENV=production.";
  }
  if (["production", "preview"].includes(source.DATABASE_ENVIRONMENT ?? "")) {
    return "Demo seed is prohibited for production or preview databases.";
  }
  if (["production", "preview"].includes(source.DEPLOYMENT_ENVIRONMENT ?? "")) {
    return "Demo seed is prohibited in production or preview deployments.";
  }
  if (
    !source.DATABASE_ENVIRONMENT ||
    !source.DEPLOYMENT_ENVIRONMENT ||
    source.DATABASE_ENVIRONMENT !== source.DEPLOYMENT_ENVIRONMENT
  ) {
    return "Demo seed requires matching explicit database and deployment environments.";
  }
  if (!source.DATABASE_URL) return "Demo seed requires DATABASE_URL.";

  let url: URL;
  try {
    url = new URL(source.DATABASE_URL);
  } catch {
    return "Demo seed requires a valid DATABASE_URL.";
  }
  const local = LOCAL_DATABASE_HOSTS.has(url.hostname.toLocaleLowerCase("en-US"));
  const explicitlyIsolatedTest =
    source.NODE_ENV === "test" &&
    source.DATABASE_ENVIRONMENT === "test" &&
    source.DEPLOYMENT_ENVIRONMENT === "test" &&
    source.ALLOW_INTEGRATION_TEST_DATABASE === "true" &&
    /(^|[_-])test($|[_-])/.test(
      url.pathname.replace(/^\//, "").toLocaleLowerCase("en-US"),
    );
  if (!local && !explicitlyIsolatedTest) {
    return "Demo seed is prohibited on non-local database hosts.";
  }

  const password = source.DEMO_SEED_PASSWORD ?? "";
  if (
    password.length < 12 ||
    password.length > 256 ||
    PUBLIC_DEMO_PASSWORDS.has(password.toLocaleLowerCase("en-US"))
  ) {
    return "DEMO_SEED_PASSWORD must be a non-public password between 12 and 256 characters.";
  }
  return null;
}

export function assertDemoSeedAllowed(source: NodeJS.ProcessEnv) {
  const error = demoSeedSafetyError(source);
  if (error) throw new Error(error);
}
