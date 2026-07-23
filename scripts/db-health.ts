import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url =
    process.env.DATABASE_URL ??
    "mysql://openers:openers_password@127.0.0.1:3306/openers_dashboard";
  const connection = await mysql.createConnection(url);
  const [rows] = await connection.query("select 1 as ok");
  await connection.end();
  console.log("Database health check passed", rows);
}

main().catch((error) => {
  console.error("Database health check failed");
  console.error(error);
  process.exit(1);
});
