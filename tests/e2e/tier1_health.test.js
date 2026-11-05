/**
 * Tier 1: Feature Coverage — Health, Database Mode & System Routing (F1, F2, F7)
 * Opaque-box verification of health status, dual-mode DB reporting, and 404 handling.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, disconnectTestDb } = require('./helpers/testDb');

describe('Tier 1: Health, Database Mode & System Routing APIs', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('F7-1: should return HTTP 200 with ok status on GET /api/health', async () => {
    const res = await testClient.getHealth();

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.status).toBe('ok');
  });

  test('F7-2: should report database connection state as connected', async () => {
    const res = await testClient.getHealth();

    expect(res.status).toBe(200);
    expect(res.body.database).toMatch(/connected|ready|ok/i);
  });

  test('F2-1: should report database operational mode (memory or external)', async () => {
    const res = await testClient.getHealth();

    expect(res.status).toBe(200);
    expect(res.body.mode).toBeDefined();
    expect(['memory', 'external']).toContain(res.body.mode.toLowerCase());
  });

  test('F1-1: should return HTTP 404 for unmapped API routes', async () => {
    const res = await testClient.get('/api/unmapped-endpoint-route-random');

    expect(res.status).toBe(404);
    expect(res.body).toBeDefined();
    expect(res.body.message || res.body.error).toBeDefined();
  });

  test('F1-2: should return proper application/json Content-Type header', async () => {
    const res = await testClient.getHealth();

    const contentType = res.headers['content-type'] || '';
    expect(contentType).toContain('application/json');
  });
});
