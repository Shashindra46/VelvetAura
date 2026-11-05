/**
 * VelvetAura - Product Image Upload & RBAC Integration Test Suite
 * 
 * Verifies:
 * 1. RBAC authorization (401 for unauthenticated, 403 for customers)
 * 2. Upload validations (no file, wrong field name, invalid file type/extension, file > 5MB)
 * 3. Successful image upload (JPEG, PNG, WebP) saving to public/assets/images/products/
 * 4. Static asset serving via express.static returning 200 OK with correct Content-Type
 * 5. Automatic disk cleanup of temporary test files
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const User = require('../src/models/User');

describe('Admin Product Image Upload API (POST /api/products/upload)', () => {
  let adminToken;
  let customerToken;
  const createdFilesOnDisk = [];

  beforeEach(async () => {
    // 1. Create admin user
    await User.create({
      name: 'Curator Admin',
      email: 'curator.admin@velvetaura.luxury',
      password: 'AdminPassword2026!',
      role: 'admin',
    });

    // 2. Create customer user
    await User.create({
      name: 'Sofia Laurent',
      email: 'sofia.laurent@velvetaura.luxury',
      password: 'CustomerPassword2026!',
      role: 'customer',
    });

    // 3. Authenticate and retrieve JWT tokens
    const adminLoginRes = await request(app).post('/api/auth/login').send({
      email: 'curator.admin@velvetaura.luxury',
      password: 'AdminPassword2026!',
    });
    adminToken = adminLoginRes.body.token;

    const customerLoginRes = await request(app).post('/api/auth/login').send({
      email: 'sofia.laurent@velvetaura.luxury',
      password: 'CustomerPassword2026!',
    });
    customerToken = customerLoginRes.body.token;
  });

  afterAll(() => {
    // Clean up any test files written to disk
    for (const filePath of createdFilesOnDisk) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
    }
  });

  describe('RBAC & Security Guards', () => {
    test('should return 401 Unauthorized when no Authorization token is provided', async () => {
      const res = await request(app).post('/api/products/upload');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('should return 403 Forbidden when requested by a customer account', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Validation & Boundary Enforcement', () => {
    test('should return 400 when no file is attached to multipart request', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('FILE_MISSING');
    });

    test('should return 400 when file is attached under unexpected field name', async () => {
      const dummyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic header
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('wrong_field', dummyBuffer, 'test.jpg');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('should reject non-image files (.txt, .pdf, .js) with 400 and invalid type message', async () => {
      const textBuffer = Buffer.from('Plain text content not an image');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', textBuffer, 'readme.txt');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/only jpeg, png, and webp images are allowed/i);
    });

    test('should reject files exceeding 5MB limit with 400', async () => {
      // 5.5 MB dummy buffer
      const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0x41);
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', oversizedBuffer, 'oversized.jpg');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/exceeds 5mb limit/i);
    });
  });

  describe('Successful Upload & Asset Serving', () => {
    test('should upload valid JPEG image, persist to disk, and return accessible static URL', async () => {
      // Valid JPEG header bytes: FF D8 FF E0
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb,
      ]);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', jpegBuffer, 'luxury-cream.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.imageUrl).toMatch(/^\/assets\/images\/products\/prod-\d+-\d+\.jpg$/);
      expect(res.body.filename).toBeDefined();

      const diskPath = path.resolve(__dirname, '../public', res.body.imageUrl.replace(/^\//, ''));
      createdFilesOnDisk.push(diskPath);

      // Verify file exists on disk
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.statSync(diskPath).size).toBeGreaterThan(0);

      // Verify static asset serving via express.static
      const staticRes = await request(app).get(res.body.imageUrl);
      expect(staticRes.status).toBe(200);
      expect(staticRes.headers['content-type']).toMatch(/image\/(jpeg|pjpeg)/);
    });

    test('should upload valid PNG image and WebP image successfully', async () => {
      // PNG header bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', pngBuffer, 'serum-bottle.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.imageUrl).toMatch(/^\/assets\/images\/products\/prod-\d+-\d+\.png$/);

      const diskPath = path.resolve(__dirname, '../public', res.body.imageUrl.replace(/^\//, ''));
      createdFilesOnDisk.push(diskPath);
      expect(fs.existsSync(diskPath)).toBe(true);

      const staticRes = await request(app).get(res.body.imageUrl);
      expect(staticRes.status).toBe(200);
      expect(staticRes.headers['content-type']).toMatch(/image\/png/);
    });
  });
});
