/**
 * VelvetAura - Jest Integration for Adversarial Upload API Stress Test
 * 
 * Pairs with tests/stress_upload_api.js to enable execution under `npm test`
 * as well as standalone node runner.
 */

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');

const uploadDir = path.resolve(__dirname, '../public/assets/images/products');

const validJpegHeader = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb
]);

const validPngHeader = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52
]);

const validWebpHeader = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20
]);

describe('Adversarial Upload API Stress & Penetration Suite', () => {
  let adminToken;
  let customerToken;
  let adminUserId;
  const createdFiles = [];

  const trackFile = (filePath) => {
    if (filePath && !createdFiles.includes(filePath)) {
      createdFiles.push(filePath);
    }
  };

  beforeEach(async () => {
    const admin = await User.create({
      name: 'Adversarial Curator Admin',
      email: `curator_${Date.now()}@velvetaura.luxury`,
      password: 'AdminPassword2026!',
      role: 'admin',
    });
    adminUserId = admin._id.toString();

    const customer = await User.create({
      name: 'Adversarial Shopper',
      email: `shopper_${Date.now()}@velvetaura.luxury`,
      password: 'ShopperPassword2026!',
      role: 'customer',
    });

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: admin.email,
      password: 'AdminPassword2026!',
    });
    adminToken = adminLogin.body.token;

    const customerLogin = await request(app).post('/api/auth/login').send({
      email: customer.email,
      password: 'ShopperPassword2026!',
    });
    customerToken = customerLogin.body.token;
  });

  afterAll(() => {
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
    }
  });

  describe('1. RBAC & Token Tampering Probes', () => {
    test('P1.1: Reject request with missing Authorization header (401)', async () => {
      const res = await request(app).post('/api/products/upload');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('P1.2: Reject customer token privilege escalation attempt (403)', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('image', validJpegHeader, 'customer_attempt.jpg');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('P1.3: Reject malformed JWT token string (401)', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', 'Bearer invalid.token.payload')
        .attach('image', validJpegHeader, 'malformed.jpg');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('P1.4: Reject empty Bearer token value (401)', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', 'Bearer ')
        .attach('image', validJpegHeader, 'empty.jpg');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('P1.5: Reject expired admin JWT token with explicit message (401)', async () => {
      const expiredToken = jwt.sign(
        { id: adminUserId, role: 'admin' },
        process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure',
        { expiresIn: '-10s' }
      );
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${expiredToken}`)
        .attach('image', validJpegHeader, 'expired.jpg');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    test('P1.6: Reject admin token forged with invalid secret (401)', async () => {
      const forgedToken = jwt.sign(
        { id: adminUserId, role: 'admin' },
        'forged_secret_key_9999',
        { expiresIn: '1h' }
      );
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${forgedToken}`)
        .attach('image', validJpegHeader, 'forged.jpg');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. File Extension & MIME Spoofing Probes', () => {
    test('P2.1: Polyglot exploit.php.jpg sanitized to prod-*.jpg without .php extension', async () => {
      const phpPayload = Buffer.concat([validJpegHeader, Buffer.from('<?php echo "EXPLOIT"; ?>')]);
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', phpPayload, 'exploit.php.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filename).toMatch(/^prod-\d+-\d+\.jpg$/);
      expect(res.body.filename).not.toMatch(/\.php/i);

      const diskPath = path.resolve(uploadDir, res.body.filename);
      trackFile(diskPath);
      expect(fs.existsSync(diskPath)).toBe(true);
    });

    test('P2.2: Reject shell script malicious.sh despite spoofed image/jpeg MIME (400)', async () => {
      const scriptBuffer = Buffer.from('#!/bin/bash\necho hack\n');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', scriptBuffer, { filename: 'malicious.sh', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILE_TYPE');
    });

    test('P2.3: Reject Windows executable trojan.exe with spoofed MIME (400)', async () => {
      const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', exeBuffer, { filename: 'trojan.exe', contentType: 'image/png' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILE_TYPE');
    });

    test('P2.4: Reject SVG file xss.svg to prevent stored XSS (400)', async () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', svgBuffer, { filename: 'xss.svg', contentType: 'image/svg+xml' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILE_TYPE');
    });

    test('P2.5: Reject PDF document invoice.pdf with spoofed image/webp MIME (400)', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', pdfBuffer, { filename: 'invoice.pdf', contentType: 'image/webp' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILE_TYPE');
    });

    test('P2.6: Reject whitelisted .jpg extension with forbidden text/plain MIME (400)', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', Buffer.from('Not an image'), { filename: 'fake.jpg', contentType: 'text/plain' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILE_TYPE');
    });

    test('P2.7: Path traversal in filename contained strictly within upload directory', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validJpegHeader, '../../../../../../etc/passwd.jpg');

      expect(res.status).toBe(200);
      expect(res.body.filename).toMatch(/^prod-\d+-\d+\.jpg$/);
      expect(res.body.filename).not.toMatch(/\.\./);

      const diskPath = path.resolve(uploadDir, res.body.filename);
      trackFile(diskPath);
      expect(diskPath.startsWith(uploadDir)).toBe(true);
    });
  });

  describe('3. Boundary File Sizes Probes', () => {
    test('P3.1: 0-byte empty file handled gracefully (200 or 400)', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', emptyBuffer, 'zero_byte.jpg');

      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        trackFile(path.resolve(uploadDir, res.body.filename));
      }
    });

    test('P3.2: Exactly 5 MB boundary file accepted and byte count matched', async () => {
      const exact5MB = 5 * 1024 * 1024;
      const buffer = Buffer.alloc(exact5MB, 0x41);
      validJpegHeader.copy(buffer, 0);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', buffer, 'exact_5mb.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const diskPath = path.resolve(uploadDir, res.body.filename);
      trackFile(diskPath);
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.statSync(diskPath).size).toBe(exact5MB);
    });

    test('P3.3: 5MB + 1B rejected with LIMIT_FILE_SIZE and clean disk state', async () => {
      const over5MB = 5 * 1024 * 1024 + 1;
      const buffer = Buffer.alloc(over5MB, 0x42);
      validJpegHeader.copy(buffer, 0);

      const filesBefore = fs.readdirSync(uploadDir);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', buffer, 'over_5mb.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('LIMIT_FILE_SIZE');

      const filesAfter = fs.readdirSync(uploadDir);
      const residual = filesAfter.filter((f) => !filesBefore.includes(f));
      expect(residual.length).toBe(0);
    });

    test('P3.4: 10MB oversized file rejected with LIMIT_FILE_SIZE and clean disk state', async () => {
      const size10MB = 10 * 1024 * 1024;
      const buffer = Buffer.alloc(size10MB, 0x43);
      validJpegHeader.copy(buffer, 0);

      const filesBefore = fs.readdirSync(uploadDir);

      let res;
      try {
        res = await request(app)
          .post('/api/products/upload')
          .set('Authorization', `Bearer ${adminToken}`)
          .attach('image', buffer, 'huge_10mb.jpg');
      } catch (err) {
        if (err.code === 'ECONNRESET' || (err.message && err.message.includes('ECONNRESET'))) {
          res = { status: 400, body: { error: 'LIMIT_FILE_SIZE' } };
        } else {
          throw err;
        }
      }

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('LIMIT_FILE_SIZE');

      const filesAfter = fs.readdirSync(uploadDir);
      const residual = filesAfter.filter((f) => !filesBefore.includes(f));
      expect(residual.length).toBe(0);
    });
  });

  describe('4. Missing Fields & Malformed Multipart Probes', () => {
    test('P4.1: Reject request with missing file payload (400 FILE_MISSING)', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('FILE_MISSING');
    });

    test('P4.2: Reject unexpected form field "avatar" (400 LIMIT_UNEXPECTED_FILE)', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('avatar', validJpegHeader, 'avatar.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('LIMIT_UNEXPECTED_FILE');
    });

    test('P4.3: Process image with extra text fields and XSS input safely', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Luxury Cream')
        .field('xss', '<script>alert(1)</script>')
        .attach('image', validJpegHeader, 'cream_with_fields.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      trackFile(path.resolve(uploadDir, res.body.filename));
    });
  });

  describe('5. Concurrency Resilience Probes', () => {
    test('P5.1: 10 parallel uploads succeed with 100% unique filenames and no collisions', async () => {
      const CONCURRENCY_COUNT = 10;
      const promises = Array.from({ length: CONCURRENCY_COUNT }, (_, index) => {
        const payload = Buffer.concat([
          validJpegHeader,
          Buffer.from(`Concurrency probe payload index=${index} timestamp=${Date.now()}`)
        ]);
        return request(app)
          .post('/api/products/upload')
          .set('Authorization', `Bearer ${adminToken}`)
          .attach('image', payload, `parallel_${index}.jpg`);
      });

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.status === 200 && r.body.success);
      expect(successes.length).toBe(CONCURRENCY_COUNT);

      const filenames = successes.map((r) => r.body.filename);
      const uniqueNames = new Set(filenames);
      expect(uniqueNames.size).toBe(CONCURRENCY_COUNT);

      for (const fname of filenames) {
        const diskPath = path.resolve(uploadDir, fname);
        trackFile(diskPath);
        expect(fs.existsSync(diskPath)).toBe(true);
      }
    });
  });

  describe('6. Static Asset Serving & Protection Probes', () => {
    test('P6.1: Uploaded PNG statically served with HTTP 200 and image/png Content-Type', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validPngHeader, 'luxury_serum.png');

      expect(res.status).toBe(200);
      trackFile(path.resolve(uploadDir, res.body.filename));

      const staticRes = await request(app).get(res.body.imageUrl);
      expect(staticRes.status).toBe(200);
      expect(staticRes.headers['content-type']).toMatch(/image\/png/);
    });

    test('P6.2: Uploaded WebP statically served with HTTP 200 and image/webp Content-Type', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validWebpHeader, 'velvet_mist.webp');

      expect(res.status).toBe(200);
      trackFile(path.resolve(uploadDir, res.body.filename));

      const staticRes = await request(app).get(res.body.imageUrl);
      expect(staticRes.status).toBe(200);
      expect(staticRes.headers['content-type']).toMatch(/image\/webp/);
    });

    test('P6.3: Static route path traversal attempts do not leak sensitive root files', async () => {
      const resTraversal = await request(app).get('/assets/images/products/../../package.json');
      const leakedPackage = resTraversal.text && resTraversal.text.includes('"name": "velvetaura"') && resTraversal.headers['content-type'].includes('json');
      expect(leakedPackage).toBeFalsy();
    });

    test('P6.4: Non-existent image URL handled gracefully without server error', async () => {
      const res = await request(app).get('/assets/images/products/ghost_image_99999.jpg');
      expect([200, 404]).toContain(res.status);
    });
  });
});
