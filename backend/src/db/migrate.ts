import { getPool, closePool } from './index';
import { createTables } from './schema';

const main = async () => {
  console.log('Running database migrations...');

  try {
    const pool = getPool();
    await createTables(pool);
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

main();
