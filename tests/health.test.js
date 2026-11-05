/**
 * VelvetAura - Health & System Diagnostic Tests
 * Verifies system uptime, database connection state, operational mode,
 * and 404 error routing.
 */

const request = require('supertest');
const app = require('../src/app');

describe('Health & Diagnostic Subsystem', () => {
  test('GET /api/health should return HTTP 200 with status ok and application/json header', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toBeDefined();
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('VelvetAura E-Commerce API');
  });

  test('GET /api/health should report database state as connected', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });

  test('GET /api/health should report operational database mode as memory or external', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(['memory', 'external']).toContain(res.body.mode);
  });

  test('GET /api/health should include valid uptime and timestamp', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });

  test('GET /api/unmapped-endpoint should return HTTP 404 with error payload', async () => {
    const res = await request(app).get('/api/unmapped-endpoint-route-random');

    expect(res.status).toBe(404);
    expect(res.body).toBeDefined();
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toBeDefined();
  });
});
