import { Pool } from 'pg';

// PostgreSQL connection pool for dropcatch database
const pool = new Pool({
  host: process.env.PSQL_DB_HOST,
  database: process.env.PSQL_DB_NAME,
  user: process.env.PSQL_DB_USER,
  password: process.env.PSQL_DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export default pool;
