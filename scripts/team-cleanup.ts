import "dotenv/config";

import {
  archiveTeamsForCleanup,
  inspectTeamCleanup,
  teamCleanupConfirmation,
  teamCleanupDigest,
} from "../src/admin/team-cleanup";
import { getPool } from "../src/db";
import {
  assertApprovedRemediationEnvironment,
  classifyRemediationDatabase,
} from "../src/db/safety";

function valuesFor(flag: string) {
  return process.argv.slice(2).flatMap((value, index, all) =>
    value === flag && all[index + 1] ? [all[index + 1]] : [],
  );
}

function valueFor(flag: string) {
  return valuesFor(flag)[0];
}

function databaseIdentity() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const url = new URL(process.env.DATABASE_URL);
  return { hostname: url.hostname, database: url.pathname.replace(/^\//, "") };
}

async function main() {
  const teamIds = valuesFor("--team-id")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const uniqueTeamIds = Array.from(new Set(teamIds)).sort();
  const organizationId = valueFor("--organization-id")?.trim().toLowerCase();
  const execute = process.argv.includes("--execute");

  if (!organizationId || uniqueTeamIds.length === 0) {
    throw new Error(
      "Supply --organization-id and at least one explicit --team-id. Dry-run is the default.",
    );
  }

  const identity = databaseIdentity();
  const classification = classifyRemediationDatabase({
    databaseUrl: process.env.DATABASE_URL,
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT,
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
  });
  console.table([{
    ...identity,
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT ?? "unset",
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT ?? "unset",
    classification,
  }]);

  const summary = await inspectTeamCleanup({ organizationId, teamIds: uniqueTeamIds });
  if (summary.length !== uniqueTeamIds.length) {
    throw new Error("One or more explicitly supplied team IDs were not found.");
  }
  const digest = teamCleanupDigest(summary);
  const confirmation = teamCleanupConfirmation({
    organizationId,
    expectedCount: uniqueTeamIds.length,
    expectedDigest: digest,
  });
  console.table(summary.map(({ memberships, auditActorIds, auditActions, ...team }) => ({
    ...team,
    auditActorIds: auditActorIds.join(","),
    auditActions: auditActions.join(","),
    membershipRows: memberships.length,
  })));
  const membershipChanges = summary.flatMap((team) =>
    team.memberships
      .filter((membership) => membership.active && membership.endedAt === null)
      .map((membership) => ({
        teamId: team.teamId,
        membershipId: membership.membershipId,
        profileId: membership.profileId,
        role: membership.role,
        change: "active -> ended",
      })),
  );
  console.table(membershipChanges);
  console.log(`Exact sorted team IDs: ${uniqueTeamIds.join(",")}`);
  console.log(`Expected affected team count: ${uniqueTeamIds.length}`);
  console.log(`Dependency digest: ${digest}`);
  console.log(`Confirmation: ${confirmation}`);

  if (!execute) {
    console.log("DRY RUN ONLY. No records were changed.");
    console.log(
      "To archive transactionally, repeat the exact --team-id values and add " +
      "--execute --actor-id <active-admin-id> " +
      `--expected-count ${uniqueTeamIds.length} ` +
      `--expected-digest ${digest} ` +
      `--confirm ${confirmation} ` +
      "--approved-environment <development|test|preview|production>",
    );
    return;
  }

  const actorId = valueFor("--actor-id")?.trim().toLowerCase();
  const expectedCount = Number(valueFor("--expected-count"));
  const expectedDigest = valueFor("--expected-digest")?.trim().toLowerCase();
  const suppliedConfirmation = valueFor("--confirm") ?? "";
  if (!actorId) throw new Error("Execution requires --actor-id.");
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    throw new Error("Execution requires a positive integer --expected-count.");
  }
  if (!expectedDigest) throw new Error("Execution requires --expected-digest.");
  if (
    expectedCount !== uniqueTeamIds.length ||
    expectedDigest !== digest ||
    suppliedConfirmation !== confirmation
  ) {
    throw new Error("The supplied approval does not match the current dry-run target set.");
  }
  assertApprovedRemediationEnvironment({
    approvedEnvironment: valueFor("--approved-environment"),
    databaseUrl: process.env.DATABASE_URL,
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT,
    deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
  });

  const result = await archiveTeamsForCleanup({
    actorId,
    confirmation: suppliedConfirmation,
    expectedCount,
    expectedDigest,
    organizationId,
    teamIds: uniqueTeamIds,
  });
  console.log(
    `Archived ${result.teams.length} teams transactionally at ${result.archivedAt.toISOString()}.`,
  );
  console.table([{
    archivedTeamCount: result.teams.length,
    endedMembershipCount: result.teams.reduce(
      (total, team) => total + team.activeMemberships,
      0,
    ),
    retainedMetricCount: result.teams.reduce(
      (total, team) => total + team.metrics,
      0,
    ),
    retainedImportRowCount: result.teams.reduce(
      (total, team) => total + team.importRows,
      0,
    ),
    approvedDigest: expectedDigest,
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
