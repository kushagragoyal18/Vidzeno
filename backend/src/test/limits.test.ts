import { checkConversionLimit } from '../middleware/limits';

// These tests hit a real PostgreSQL database.
// They run only when RUN_INTEGRATION_TESTS=true to keep unit-test runs fast.
const INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';
const maybeDescribe = INTEGRATION ? describe : describe.skip;

maybeDescribe('Conversion Limits (integration)', () => {
  // Lazy-load db so the pool isn't created until the test actually runs
  let pool: import('pg').Pool;
  let closePool: () => Promise<void>;

  beforeAll(async () => {
    const db = await import('../db/index');
    pool = db.getPool();
    closePool = db.closePool;

    await pool.query(
      `INSERT INTO users (id, email, plan)
       VALUES ($1, $2, 'free')
       ON CONFLICT (id) DO NOTHING`,
      ['test-user-limits', 'test_limits@example.com']
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', ['test-user-limits']);
    await pool.query('DELETE FROM users WHERE id = $1', ['test-user-premium']);
    await closePool();
  });

  describe('checkConversionLimit', () => {
    it('should allow free user under limit', async () => {
      const result = await checkConversionLimit('test-user-limits', 'free');
      expect(result.allowed).toBe(true);
      expect(result.dailyLimit).toBe(2);
    });

    it('should always allow premium users', async () => {
      await pool.query(
        `INSERT INTO users (id, email, plan)
         VALUES ($1, $2, 'premium')
         ON CONFLICT (id) DO NOTHING`,
        ['test-user-premium', 'test_premium@example.com']
      );

      const result = await checkConversionLimit('test-user-premium', 'premium');
      expect(result.allowed).toBe(true);
      expect(result.dailyLimit).toBe(-1);
    });
  });
});

// ── Pure unit tests — no DB needed ───────────────────────────

describe('checkConversionLimit — unit', () => {
  it('immediately allows premium without touching the DB', async () => {
    // Mock the query function so the DB is never called for premium
    jest.mock('../db/index', () => ({
      query: jest.fn().mockRejectedValue(new Error('should not be called')),
      getPool: jest.fn(),
      closePool: jest.fn(),
      transaction: jest.fn(),
    }));

    const result = await checkConversionLimit('any-user-id', 'premium');
    expect(result.allowed).toBe(true);
    expect(result.dailyLimit).toBe(-1);
    expect(result.dailyCount).toBe(0);

    jest.resetModules();
  });
});
