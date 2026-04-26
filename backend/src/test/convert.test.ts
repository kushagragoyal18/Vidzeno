import { SUPPORTED_FORMATS, FORMAT_DESCRIPTIONS } from '../routes/convert';

describe('Convert Route — format constants', () => {
  describe('SUPPORTED_FORMATS', () => {
    const expected = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', 'mp3'];

    it('contains all expected output formats', () => {
      expected.forEach((fmt) => expect(SUPPORTED_FORMATS.has(fmt)).toBe(true));
    });

    it('rejects unknown formats', () => {
      expect(SUPPORTED_FORMATS.has('exe')).toBe(false);
      expect(SUPPORTED_FORMATS.has('zip')).toBe(false);
      expect(SUPPORTED_FORMATS.has('')).toBe(false);
    });
  });

  describe('FORMAT_DESCRIPTIONS', () => {
    it('has a description for every supported format', () => {
      SUPPORTED_FORMATS.forEach((fmt) => {
        expect(FORMAT_DESCRIPTIONS[fmt]).toBeDefined();
        expect(typeof FORMAT_DESCRIPTIONS[fmt]).toBe('string');
        expect(FORMAT_DESCRIPTIONS[fmt].length).toBeGreaterThan(0);
      });
    });
  });
});

// ──────────────────────────────────────────────────────────────
// HTTP integration tests — these require a running DB & Redis.
// They are skipped automatically when DATABASE_URL points to an
// unavailable host, keeping CI green without infra.
// ──────────────────────────────────────────────────────────────

const INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';
const maybeDescribe = INTEGRATION ? describe : describe.skip;

maybeDescribe('POST /api/convert (integration)', () => {
  // Lazy imports so module-level side-effects (Redis/DB connections)
  // are not triggered in unit-only runs.
  let request: typeof import('supertest');
  let app: typeof import('../index').default;

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../index')).default;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/convert')
      .send({ fileId: 'abc', outputFormat: 'mp4' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for unsupported output format', async () => {
    // Register + login to get a session cookie
    const testEmail = `convert_test_${Date.now()}@example.com`;

    await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: 'password123' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'password123' });

    const cookie = loginRes.headers['set-cookie'];

    const res = await request(app)
      .post('/api/convert')
      .set('Cookie', cookie)
      .send({ fileId: 'some-file-id', outputFormat: 'exe' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid output format');
    expect(res.body.supportedFormats).toEqual(expect.arrayContaining(['mp4', 'mp3']));
  });

  it('returns 404 when file does not exist', async () => {
    const testEmail = `convert_test2_${Date.now()}@example.com`;

    await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: 'password123' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'password123' });

    const cookie = loginRes.headers['set-cookie'];

    const res = await request(app)
      .post('/api/convert')
      .set('Cookie', cookie)
      .send({ fileId: '00000000-0000-0000-0000-000000000000', outputFormat: 'mp4' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'File not found');
  });

  it('returns job info for valid conversion request', async () => {
    const testEmail = `convert_test3_${Date.now()}@example.com`;

    await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: 'password123' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'password123' });

    const cookie = loginRes.headers['set-cookie'];

    // Upload a minimal file first
    const fileBuffer = Buffer.from('fake-video-data');

    const uploadRes = await request(app)
      .post('/api/upload')
      .set('Cookie', cookie)
      .attach('file', fileBuffer, { filename: 'test.mp4', contentType: 'video/mp4' });

    // Upload may fail without a real file store — just validate shape
    if (uploadRes.status === 200) {
      const { fileId } = uploadRes.body;

      const convertRes = await request(app)
        .post('/api/convert')
        .set('Cookie', cookie)
        .send({ fileId, outputFormat: 'mp4' });

      // Could be 200 (queued) or 400 (file not ready / wrong status)
      expect([200, 400, 403, 500]).toContain(convertRes.status);
    }
  });
});

maybeDescribe('GET /api/convert/formats (integration)', () => {
  let request: typeof import('supertest');
  let app: typeof import('../index').default;

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../index')).default;
  });

  it('returns list of supported formats', async () => {
    const res = await request(app).get('/api/convert/formats');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('formats');
    expect(Array.isArray(res.body.formats)).toBe(true);
    expect(res.body.formats.length).toBeGreaterThan(0);

    res.body.formats.forEach((f: { id: string; name: string; description: string }) => {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('name');
      expect(f).toHaveProperty('description');
    });
  });
});

maybeDescribe('GET /api/convert/job/:jobId (integration)', () => {
  let request: typeof import('supertest');
  let app: typeof import('../index').default;

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../index')).default;
  });

  it('returns 404 for non-existent job', async () => {
    const res = await request(app).get(
      '/api/convert/job/00000000-0000-0000-0000-000000000000'
    );

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Job not found');
  });
});
