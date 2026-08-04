import "dotenv/config";

import { createRequire } from "node:module";

import { getPool } from "../src/db";
import {
  assertApprovedRemediationEnvironment,
  classifyRemediationDatabase,
} from "../src/db/safety";

function valueFor(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function databaseIdentity() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const url = new URL(process.env.DATABASE_URL);
  return {
    hostname: url.hostname,
    databaseName: url.pathname.replace(/^\//, ""),
  };
}

async function main() {
  // This trusted CLI intentionally reuses the server-only deletion service.
  // Stub the framework marker before loading that module outside Next.js.
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as NodeJS.Module;
  const {
    inspectLegacyDeletedProfiles,
    purgeLegacyDeletedProfiles,
  } = await import("../src/admin/legacy-user-purge");

  const organizationId = valueFor("--organization-id")?.trim().toLowerCase();
  const execute = process.argv.includes("--execute");
  if (!organizationId) {
    throw new Error("Supply --organization-id. Dry-run is the default.");
  }

  const identity = databaseIdentity();
  const classification = classifyRemediationDatabase({
    databaseUrl: process.env.DATABASE_URL,
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT,
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
  });
  console.table([{
    hostname: identity.hostname,
    database: identity.databaseName,
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT ?? "unset",
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT ?? "unset",
    classification,
  }]);

  const summary = await inspectLegacyDeletedProfiles({ organizationId });
  console.table(summary.profiles);
  console.table([summary.dependencies]);
  console.log(`Legacy deleted profiles: ${summary.expectedCount}`);
  console.log(`Target digest: ${summary.digest}`);
  console.log(`Confirmation: ${summary.confirmation}`);

  if (!execute) {
    console.log("DRY RUN ONLY. No records were changed.");
    console.log(
      "To execute the exact approved target set, add " +
      "--execute --actor-id <active-admin-id> " +
      `--expected-count ${summary.expectedCount} ` +
      `--expected-digest ${summary.digest} ` +
      `--confirm ${summary.confirmation} ` +
      "--approved-environment <development|test|preview|production>",
    );
    return;
  }
  if (summary.expectedCount === 0) {
    throw new Error("There are no legacy deleted profiles to purge.");
  }

  const actorId = valueFor("--actor-id")?.trim().toLowerCase();
  const expectedCount = Number(valueFor("--expected-count"));
  const expectedDigest = valueFor("--expected-digest")?.trim().toLowerCase();
  const confirmation = valueFor("--confirm") ?? "";
  if (!actorId) throw new Error("Execution requires --actor-id.");
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    throw new Error("Execution requires a positive integer --expected-count.");
  }
  if (!expectedDigest) throw new Error("Execution requires --expected-digest.");
  if (
    expectedCount !== summary.expectedCount ||
    expectedDigest !== summary.digest ||
    confirmation !== summary.confirmation
  ) {
    throw new Error("The supplied approval does not match the current dry-run target set.");
  }

  assertApprovedRemediationEnvironment({
    approvedEnvironment: valueFor("--approved-environment"),
    databaseUrl: process.env.DATABASE_URL,
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT,
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
  });
  const result = await purgeLegacyDeletedProfiles({
    actorId,
    organizationId,
    profileIds: summary.profileIds,
    approval: {
      confirmation,
      expectedCount,
      expectedDigest,
      requiredAccountStatus: "deleted",
    },
  });
  console.log("Legacy deleted-profile purge completed transactionally.");
  console.table([{
    deletedCount: result.deletedIds.length,
    approvedDigest: expectedDigest,
    organizationId,
  }]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
