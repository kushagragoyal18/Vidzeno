import { getPool, closePool } from './index';
import bcrypt from 'bcrypt';

const main = async () => {
  console.log('Seeding database...');

  try {
    const pool = getPool();

    // Create a test user
    const email = 'test@example.com';
    const password = await bcrypt.hash('password123', 10);

    await pool.query(
      `INSERT INTO users (email, password_hash, plan)
       VALUES ($1, $2, 'free')
       ON CONFLICT (email) DO NOTHING`,
      [email, password]
    );

    console.log('Test user created: test@example.com / password123');
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
};

main();
