import { Pool } from "pg";

/**
 * Give each test its own schema, so concurrent tests do not see each other's data.
 */
export async function testPool(): Promise<Pool> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set: start the Postgres of the project shell"
    );
  }

  const schema = `test_${Math.random().toString(36).slice(2)}`;
  const setup = new Pool({ connectionString: url });
  try {
    await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await setup.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await setup.end();
  }

  const pool = new Pool({ connectionString: url });
  pool.on("connect", (client) => {
    client
      .query(`SET search_path TO "${schema}"`)
      .catch((err) => client.emit("error", err));
  });
  return pool;
}
