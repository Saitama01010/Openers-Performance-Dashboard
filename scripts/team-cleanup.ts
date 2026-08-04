import "dotenv/config";

import {
  archiveTeamsForCleanup,
  inspectTeamCleanup,
} from "../src/admin/team-cleanup";
import { getPool } from "../src/db";

function valuesFor(flag: string) {
  return process.argv.slice(2).flatMap((value, index, all) =>
    value === flag && all[index + 1] ? [all[index + 1]] : [],
  );
}

function valueFor(flag: string) {
  return valuesFor(flag)[0];
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

  const summary = await inspectTeamCleanup({ organizationId, teamIds: uniqueTeamIds });
  console.table(summary);
  if (summary.length !== uniqueTeamIds.length) {
    throw new Error("One or more explicitly supplied team IDs were not found.");
  }

  if (!execute) {
    const confirmation = `ARCHIVE:${uniqueTeamIds.join(",")}`;
    console.log("DRY RUN ONLY. No records were changed.");
    console.log(
      `To archive transactionally, add --execute --actor-id <admin-id> --confirm ${confirmation}`,
    );
    return;
  }

  const actorId = valueFor("--actor-id")?.trim().toLowerCase();
  const confirmation = valueFor("--confirm") ?? "";
  if (!actorId) throw new Error("Destructive execution requires --actor-id.");

  const result = await archiveTeamsForCleanup({
    actorId,
    confirmation,
    organizationId,
    teamIds: uniqueTeamIds,
  });
  console.log(
    `Archived ${result.teams.length} teams transactionally at ${result.archivedAt.toISOString()}.`,
  );
  console.table(result.teams);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
