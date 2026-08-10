import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { getEnv } from "@/env";
import * as schema from "@/db/schema";

type DatabasePool = ReturnType<typeof mysql.createPool>;

const globalDatabase = globalThis as typeof globalThis & {
  __openersPool?: DatabasePool;
};

let pool: DatabasePool | null = globalDatabase.__openersPool ?? null;

function createDb() {
  return drizzle({ client: getPool(), schema, mode: "default" });
}

let db: ReturnType<typeof createDb> | null = null;

export function getPool() {
  if (!pool) {
    const env = getEnv();
    pool = mysql.createPool({
      uri: env.DATABASE_URL,
      connectionLimit: env.DATABASE_POOL_CONNECTION_LIMIT,
      connectTimeout: env.DATABASE_CONNECT_TIMEOUT_MS,
      idleTimeout: env.DATABASE_IDLE_TIMEOUT_MS,
      maxIdle: env.DATABASE_POOL_CONNECTION_LIMIT,
      waitForConnections: true,
      queueLimit: env.DATABASE_POOL_QUEUE_LIMIT,
      enableKeepAlive: true,
      ssl:
        env.DATABASE_TLS === "required"
          ? { rejectUnauthorized: true }
          : undefined,
    });
    if (process.env.NODE_ENV !== "production") {
      globalDatabase.__openersPool = pool;
    }
  }

  return pool;
}

export async function closeDatabasePool() {
  if (!pool) return;
  const closingPool = pool;
  pool = null;
  db = null;
  delete globalDatabase.__openersPool;
  await closingPool.end();
}

export async function checkDatabaseReadiness() {
  const connection = await getPool().getConnection();
  try {
    await connection.query("SELECT 1");
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS expected_tables FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('organizations', 'profiles', 'sessions', 'import_jobs', 'email_outbox')",
    );
    if (Number(rows[0]?.expected_tables ?? 0) !== 5) {
      throw new Error("Database schema is not at the expected application revision.");
    }
  } finally {
    connection.release();
  }
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
