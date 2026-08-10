import "dotenv/config";

import { runRetentionCleanup } from "../src/cleanup/service";
import { closeDatabasePool } from "../src/db";
import { validateEnv } from "../src/env";

validateEnv();

async function main() {
  const execute = process.argv.includes("--execute");
  const result = await runRetentionCleanup({ dryRun: !execute });
  console.info(JSON.stringify({ action: "retention.cleanup", ...result }));
  await closeDatabasePool();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabasePool();
  process.exitCode = 1;
});
