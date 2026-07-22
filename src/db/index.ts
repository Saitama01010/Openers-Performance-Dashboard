import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { getEnv } from "@/env";
import * as schema from "@/db/schema";

let pool: ReturnType<typeof mysql.createPool> | null = null;

function createDb() {
  return drizzle({ client: getPool(), schema, mode: "default" });
}

let db: ReturnType<typeof createDb> | null = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      uri: getEnv().DATABASE_URL,
      connectionLimit: 10,
    });
  }

  return pool;
}

export function getDb() {
  if (!db) {
    db = createDb();
  }

  const currentDb = db;

  if (!currentDb) {
    throw new Error("Database client failed to initialize");
  }

  return currentDb;
}
