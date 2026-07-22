import "dotenv/config";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb, getPool } from "../src/db";

async function main() {
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  await getPool().end();
  console.log("Database migrations applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
