/**
 * Tier 1: Feature Coverage — Authentication & User Management (F4, F5, F6)
 * Opaque-box verification of registration, login, token auth, and profile retrieval.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, disconnectTestDb } = require('./helpers/testDb');
const { createUniqueUser } = require('./helpers/fixtures');

describe('Tier 1: Authentication & User Management APIs', () => {
  let userFixture;
  let authToken;

  beforeAll(async () => {
    await connectTestDb();
    userFixture = createUniqueUser('tier1_auth');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('F4-1: should register a new customer successfully with complete details', async () => {
    const res = await testClient.register(userFixture);

    expect([200, 201]).toContain(res.status);
    expect(res.body).toBeDefined();

    const user = res.body.user || res.body;
    expect(user.email).toBe(userFixture.email.toLowerCase());
    expect(user.name).toBe(userFixture.name);
    expect(res.body.token || user.token).toBeDefined();

    authToken = res.body.token || user.token;
  });

  test('F5-1: should log in an existing customer with valid credentials and return JWT', async () => {
    const res = await testClient.login({
      email: userFixture.email,
      password: userFixture.password
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();

    const token = res.body.token || (res.body.user && res.body.user.token);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    authToken = token;
  });

  test('F6-1: should fetch authenticated customer profile with Bearer token', async () => {
    const res = await testClient.getProfile(authToken);

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();

    const user = res.body.user || res.body;
    expect(user.email).toBe(userFixture.email.toLowerCase());
    expect(user.name).toBe(userFixture.name);
  });

  test('F4/F6-2: should never expose user password hash in any authentication response', async () => {
    // Check registration response
    const newUser = createUniqueUser('pwd_check');
    const regRes = await testClient.register(newUser);
    const regUser = regRes.body.user || regRes.body;
    expect(regUser.password).toBeUndefined();

    // Check login response
    const loginRes = await testClient.login({
      email: newUser.email,
      password: newUser.password
    });
    const loginUser = loginRes.body.user || loginRes.body;
    expect(loginUser.password).toBeUndefined();

    // Check profile response
    const token = loginRes.body.token || (loginRes.body.user && loginRes.body.user.token);
    const meRes = await testClient.getProfile(token);
    const meUser = meRes.body.user || meRes.body;
    expect(meUser.password).toBeUndefined();
  });

  test('F4-3: should reject registration if email is missing or empty', async () => {
    const invalidUser = {
      name: 'No Email User',
      password: 'Password123!'
    };
    const res = await testClient.register(invalidUser);

    expect(res.status).toBe(400);
    expect(res.body).toBeDefined();
    expect(res.body.message || res.body.error).toBeDefined();
  });

  test('F5-2: should reject login attempt with incorrect password', async () => {
    const res = await testClient.login({
      email: userFixture.email,
      password: 'CompletelyWrongPassword999!'
    });

    expect(res.status).toBe(401);
    expect(res.body).toBeDefined();
    expect(res.body.message || res.body.error).toBeDefined();
  });
});
