import "dotenv/config";

import { getPool } from "../src/db";
import { initializeReferenceData } from "./db-reference-data";

async function main() {
  await initializeReferenceData();
  await getPool().end();
  console.log("Required organization, role, and permission reference data initialized.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Reference-data initialization failed.");
  process.exit(1);
});
