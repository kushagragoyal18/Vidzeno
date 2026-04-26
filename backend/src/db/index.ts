import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

let db: PGlite | null = null;

export const getPool = (): PGlite => {
  if (!db) {
    const dataDir = process.env.PGDATA_DIR || path.join(process.cwd(), '.pgdata');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new PGlite(dataDir);
  }
  return db;
};

export const closePool = async (): Promise<void> => {
  if (db) {
    await db.close();
    db = null;
  }
};

export const query = async <T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> => {
  const database = getPool();
  // PGlite requires awaited initialization before queries in some cases, but queries are async anyway
  const result = await database.query<T>(text, params);
  return { rows: result.rows as T[] };
};

export const transaction = async <T>(
  fn: (client: PGlite) => Promise<T>
): Promise<T> => {
  const database = getPool();
  // PGlite supports transactions natively
  return await database.transaction(async (tx) => {
    // The `tx` object has a query method just like client
    return await fn(tx as any);
  });
};
