import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function run(command: string, environment = process.env) {
  console.info(`\n[rehearsal] ${command}`);
  const result = spawnSync(command, { shell: true, stdio: "inherit", env: environment });
  if (result.status !== 0) throw new Error(`Production rehearsal failed: ${command}`);
}

function productionBuildEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "NODE_ENV"),
  ) as NodeJS.ProcessEnv;
  environment.DATABASE_ENVIRONMENT = "production";
  environment.DEPLOYMENT_ENVIRONMENT = "production";
  environment.APP_URL = "https://build.invalid";
  environment.EMAIL_PROVIDER = "resend";
  environment.RESEND_API_KEY =
    environment.RESEND_API_KEY ?? "rehearsal-build-only-not-a-provider-key";
  environment.EMAIL_FROM_ADDRESS =
    environment.EMAIL_FROM_ADDRESS ?? "no-reply@build.invalid";
  return environment;
}

async function migrationDigest() {
  const files = (await readdir("drizzle", { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update(await readFile(join("drizzle", file)));
  return hash.digest("hex");
}

async function main() {
const before = await migrationDigest();
for (const command of [
  "npm run lint",
  "npm run typecheck",
  "npm run test",
]) run(command);
run("npm run build", productionBuildEnvironment());
for (const command of [
  "npm run db:generate",
  "git diff --exit-code -- drizzle",
  "npm audit --audit-level=high",
  "git diff --check",
]) run(command);
const after = await migrationDigest();
if (before !== after) throw new Error("db:generate changed the migration SQL set.");

if (process.argv.includes("--with-db")) {
  for (const command of [
    "npm run db:migrate:upgrade-test",
    "npm run db:migrate:test",
    "npm run db:migrate",
    "npm run db:bootstrap",
    "npm run db:health",
    "npm run worker:imports -- --once",
    "npm run worker:email -- --once",
    "npm run cleanup:retention -- --dry-run",
  ]) run(command);
}

console.info("\n[rehearsal] all requested checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
