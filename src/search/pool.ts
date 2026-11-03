import { Pool } from "pg";

// The timeout makes an unreachable database fail the start, not hang it.
const CONNECT_TIMEOUT_MS = 10_000;

export function createSearchPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  // An idle client can fail when Postgres restarts. Without a listener, that error ends the process.
  pool.on("error", (error) =>
    console.error(`[paperless-mcp] index: database pool error: ${error.message}`)
  );
  return pool;
}
