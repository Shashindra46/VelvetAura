#!/usr/bin/env node
/**
 * VelvetAura - Adversarial Upload API Stress & Penetration Test Harness
 * 
 * Empirically challenges:
 * 1. RBAC & Privilege Escalation (no token, customer role, malformed JWT, expired token, forged signature)
 * 2. MIME & Extension Spoofing (double extensions, .sh/.exe/.svg/.pdf/.html, mismatched MIME/ext, traversal)
 * 3. Boundary File Sizes (0B empty, exactly 5MB, 5MB + 1 byte, 10MB oversized, residual disk cleanup)
 * 4. Missing Fields & Malformed Multipart (empty body, wrong field name, extra fields, corrupted boundary)
 * 5. High-Concurrency Resilience (10 simultaneous uploads, collision resistance, latency measurement)
 * 6. Static Asset Serving & Protection (JPEG/PNG/WebP serving, path traversal defense, nonexistent asset fallback)
 * 7. Guaranteed Disk Teardown & Resource Cleanup
 */

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Ensure test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure';
process.env.PORT = process.env.PORT || '5002';

const app = require('../src/app');
const { connectDB, disconnectDB, clearDatabase } = require('../src/config/db');
const User = require('../src/models/User');

// Target assets directory
const uploadDir = path.resolve(__dirname, '../public/assets/images/products');

// Execution statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
  createdFiles: [],
};

// Console formatting helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function logHeader(title) {
  console.log(`\n${colors.bold}${colors.cyan}=== ${title} ===${colors.reset}`);
}

function logPass(probeName, detail = '') {
  stats.total++;
  stats.passed++;
  const suffix = detail ? ` ${colors.yellow}(${detail})${colors.reset}` : '';
  console.log(`  ${colors.green}✓ [PASS]${colors.reset} ${probeName}${suffix}`);
}

function logFail(probeName, errorDetail) {
  stats.total++;
  stats.failed++;
  stats.failures.push({ probeName, errorDetail });
  console.error(`  ${colors.red}✗ [FAIL]${colors.reset} ${probeName}`);
  console.error(`         ${colors.red}Reason: ${errorDetail}${colors.reset}`);
}

function trackFile(filePath) {
  if (filePath && !stats.createdFiles.includes(filePath)) {
    stats.createdFiles.push(filePath);
  }
}

// Minimal valid image buffers
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

async function runAdversarialStressSuite() {
  const startTime = Date.now();
  console.log(`\n${colors.bold}======================================================================${colors.reset}`);
  console.log(`${colors.bold} VelvetAura: Adversarial Upload API & Static Serving Stress Harness  ${colors.reset}`);
  console.log(`${colors.bold}======================================================================${colors.reset}`);
  console.log(`Start Time  : ${new Date().toISOString()}`);
  console.log(`Environment : NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`Target Dir  : ${uploadDir}\n`);

  let adminToken;
  let customerToken;
  let adminUserId;

  try {
    // 0. Setup In-Memory Database and Accounts
    await connectDB({ forceMemory: true, autoSeed: false });
    await clearDatabase();

    const admin = await User.create({
      name: 'Adversarial Curator Admin',
      email: 'curator.stress@velvetaura.luxury',
      password: 'AdminPassword2026!',
      role: 'admin',
    });
    adminUserId = admin._id.toString();

    await User.create({
      name: 'Adversarial Shopper',
      email: 'shopper.stress@velvetaura.luxury',
      password: 'ShopperPassword2026!',
      role: 'customer',
    });

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'curator.stress@velvetaura.luxury',
      password: 'AdminPassword2026!',
    });
    adminToken = adminLogin.body.token;

    const customerLogin = await request(app).post('/api/auth/login').send({
      email: 'shopper.stress@velvetaura.luxury',
      password: 'ShopperPassword2026!',
    });
    customerToken = customerLogin.body.token;

    if (!adminToken || !customerToken) {
      throw new Error('Failed to retrieve authentication tokens');
    }

    // -------------------------------------------------------------------------
    // CATEGORY 1: RBAC Privilege Escalation & Token Tampering
    // -------------------------------------------------------------------------
    logHeader('1. RBAC Privilege Escalation & Token Tampering Probes');

    // 1.1 Unauthenticated request (no header)
    {
      const res = await request(app).post('/api/products/upload');
      if (res.status === 401 && res.body.success === false) {
        logPass('P1.1: Reject request with missing Authorization header (HTTP 401)');
      } else {
        logFail('P1.1: Reject request with missing Authorization header', `Expected 401, got ${res.status}`);
      }
    }

    // 1.2 Customer role token (privilege escalation)
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('image', validJpegHeader, 'customer_attempt.jpg');

      if (res.status === 403 && res.body.success === false) {
        logPass('P1.2: Reject customer token privilege escalation attempt (HTTP 403)');
      } else {
        logFail('P1.2: Reject customer token privilege escalation attempt', `Expected 403, got ${res.status}`);
      }
    }

    // 1.3 Malformed JWT string
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', 'Bearer this.is.an.invalid.jwt.token')
        .attach('image', validJpegHeader, 'malformed.jpg');

      if (res.status === 401 && res.body.success === false) {
        logPass('P1.3: Reject malformed JWT token string (HTTP 401)');
      } else {
        logFail('P1.3: Reject malformed JWT token string', `Expected 401, got ${res.status}`);
      }
    }

    // 1.4 Empty Bearer token
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', 'Bearer ')
        .attach('image', validJpegHeader, 'empty_bearer.jpg');

      if (res.status === 401 && res.body.success === false) {
        logPass('P1.4: Reject empty Bearer token value (HTTP 401)');
      } else {
        logFail('P1.4: Reject empty Bearer token value', `Expected 401, got ${res.status}`);
      }
    }

    // 1.5 Expired Admin JWT Token
    {
      const expiredToken = jwt.sign(
        { id: adminUserId, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '-10s' } // Expired 10 seconds ago
      );

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${expiredToken}`)
        .attach('image', validJpegHeader, 'expired.jpg');

      if (res.status === 401 && res.body.message.toLowerCase().includes('expired')) {
        logPass('P1.5: Reject expired admin JWT token with explicit expiry message (HTTP 401)');
      } else {
        logFail('P1.5: Reject expired admin JWT token', `Expected 401 with expired message, got ${res.status}`);
      }
    }

    // 1.6 Tampered Signature (signed with fake secret)
    {
      const forgedToken = jwt.sign(
        { id: adminUserId, role: 'admin' },
        'forged_unauthorized_signing_key_9999',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${forgedToken}`)
        .attach('image', validJpegHeader, 'forged.jpg');

      if (res.status === 401 && res.body.success === false) {
        logPass('P1.6: Reject admin token forged with invalid signing secret (HTTP 401)');
      } else {
        logFail('P1.6: Reject admin token forged with invalid signing secret', `Expected 401, got ${res.status}`);
      }
    }

    // 1.7 Non-existent User ID in signed token
    {
      const ghostId = '6634567890abcdef12345678';
      const ghostToken = jwt.sign(
        { id: ghostId, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${ghostToken}`)
        .attach('image', validJpegHeader, 'ghost.jpg');

      if (res.status === 401 && res.body.success === false) {
        logPass('P1.7: Reject valid token referencing non-existent User ID (HTTP 401)');
      } else {
        logFail('P1.7: Reject valid token referencing non-existent User ID', `Expected 401, got ${res.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // CATEGORY 2: File Extension & MIME Spoofing Probes
    // -------------------------------------------------------------------------
    logHeader('2. File Extension & MIME Spoofing Probes');

    // 2.1 Double extension: exploit.php.jpg (polyglot naming)
    {
      const phpPayload = Buffer.concat([validJpegHeader, Buffer.from('<?php echo "EXPLOIT"; ?>')]);
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', phpPayload, 'exploit.php.jpg');

      if (res.status === 200 && res.body.success === true) {
        const savedFilename = res.body.filename;
        const diskPath = path.resolve(uploadDir, savedFilename);
        trackFile(diskPath);

        const hasPhp = savedFilename.toLowerCase().includes('.php');
        const matchesPattern = /^prod-\d+-\d+\.jpg$/.test(savedFilename);

        if (!hasPhp && matchesPattern && fs.existsSync(diskPath)) {
          logPass('P2.1: Double extension exploit.php.jpg sanitized: .php stripped, saved as prod-*.jpg', savedFilename);
        } else {
          logFail('P2.1: Double extension exploit.php.jpg sanitization', `File saved with unsafe name: ${savedFilename}`);
        }
      } else {
        logFail('P2.1: Double extension exploit.php.jpg handling', `Expected 200 with sanitized name, got ${res.status}`);
      }
    }

    // 2.2 Shell script with spoofed image/jpeg MIME type
    {
      const scriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /\n');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', scriptBuffer, { filename: 'malicious.sh', contentType: 'image/jpeg' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.2: Reject shell script malicious.sh despite spoofed image/jpeg MIME (HTTP 400)');
      } else {
        logFail('P2.2: Reject shell script malicious.sh with spoofed MIME', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.3 Windows executable with spoofed image/png MIME type
    {
      const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', exeBuffer, { filename: 'trojan.exe', contentType: 'image/png' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.3: Reject Windows executable trojan.exe with spoofed image/png MIME (HTTP 400)');
      } else {
        logFail('P2.3: Reject Windows executable trojan.exe', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.4 SVG file with potential XSS payload
    {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', svgBuffer, { filename: 'xss.svg', contentType: 'image/svg+xml' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.4: Reject SVG file xss.svg (XSS vector prevention) (HTTP 400)');
      } else {
        logFail('P2.4: Reject SVG file xss.svg', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.5 PDF document with spoofed image/webp MIME
    {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%...\n');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', pdfBuffer, { filename: 'invoice.pdf', contentType: 'image/webp' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.5: Reject PDF document invoice.pdf with spoofed image/webp MIME (HTTP 400)');
      } else {
        logFail('P2.5: Reject PDF document invoice.pdf', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.6 HTML file with spoofed image/jpeg MIME
    {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body><h1>Phishing</h1></body></html>');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', htmlBuffer, { filename: 'login.html', contentType: 'image/jpeg' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.6: Reject HTML document login.html with spoofed image/jpeg MIME (HTTP 400)');
      } else {
        logFail('P2.6: Reject HTML document login.html', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.7 Whitelisted extension .jpg with forbidden MIME text/plain
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', Buffer.from('Plain text'), { filename: 'text_in_disguise.jpg', contentType: 'text/plain' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.7: Reject whitelisted .jpg extension with forbidden text/plain MIME (HTTP 400)');
      } else {
        logFail('P2.7: Reject whitelisted .jpg with text/plain MIME', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.8 Whitelisted extension .png with application/octet-stream MIME
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validPngHeader, { filename: 'binary.png', contentType: 'application/octet-stream' });

      if (res.status === 400 && res.body.error === 'INVALID_FILE_TYPE') {
        logPass('P2.8: Reject .png extension paired with application/octet-stream MIME (HTTP 400)');
      } else {
        logFail('P2.8: Reject .png with application/octet-stream', `Expected 400 INVALID_FILE_TYPE, got ${res.status}`);
      }
    }

    // 2.9 Path traversal attempt in original filename
    {
      const traversalName = '../../../../../../etc/passwd.jpg';
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validJpegHeader, traversalName);

      if (res.status === 200 && res.body.success === true) {
        const savedFilename = res.body.filename;
        const diskPath = path.resolve(uploadDir, savedFilename);
        trackFile(diskPath);

        const isContained = diskPath.startsWith(uploadDir);
        const hasDotDot = savedFilename.includes('..');

        if (isContained && !hasDotDot) {
          logPass('P2.9: Path traversal in filename neutralized: contained strictly within target directory', savedFilename);
        } else {
          logFail('P2.9: Path traversal in filename neutralized', `File escaped upload directory: ${diskPath}`);
        }
      } else {
        logFail('P2.9: Path traversal in filename neutralized', `Expected 200 with sanitized path, got ${res.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // CATEGORY 3: Boundary File Sizes (0B, 5MB, 5MB+1B, 10MB)
    // -------------------------------------------------------------------------
    logHeader('3. Boundary File Sizes Probes (0B, 5MB, 5MB+1B, 10MB)');

    // 3.1 0-Byte Empty File Upload
    {
      const emptyBuffer = Buffer.alloc(0);
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', emptyBuffer, 'zero_byte.jpg');

      // Check whether 0-byte upload succeeds or errors
      if (res.status === 200 && res.body.success === true) {
        const diskPath = path.resolve(uploadDir, res.body.filename);
        trackFile(diskPath);
        const stat = fs.existsSync(diskPath) ? fs.statSync(diskPath) : null;
        logPass('P3.1: 0-byte empty file handled gracefully (HTTP 200)', `Saved size: ${stat ? stat.size : 'none'} bytes`);
      } else if (res.status === 400) {
        logPass('P3.1: 0-byte empty file rejected with validation error (HTTP 400)', res.body.message);
      } else {
        logFail('P3.1: 0-byte empty file handled gracefully', `Unexpected status ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // 3.2 Exactly 5 MB Boundary File (5,242,880 bytes)
    {
      const exact5MB = 5 * 1024 * 1024; // 5242880 bytes
      const exact5MBBuffer = Buffer.alloc(exact5MB, 0x41);
      validJpegHeader.copy(exact5MBBuffer, 0);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', exact5MBBuffer, 'exact_5mb.jpg');

      if (res.status === 200 && res.body.success === true) {
        const diskPath = path.resolve(uploadDir, res.body.filename);
        trackFile(diskPath);
        const actualSize = fs.existsSync(diskPath) ? fs.statSync(diskPath).size : -1;

        if (actualSize === exact5MB) {
          logPass('P3.2: Exactly 5 MB boundary file uploaded successfully with matching byte count', `5,242,880 bytes`);
        } else {
          logFail('P3.2: Exactly 5 MB boundary file byte count', `Expected ${exact5MB} bytes, found ${actualSize}`);
        }
      } else {
        logFail('P3.2: Exactly 5 MB boundary file upload', `Expected 200, got ${res.status}: ${res.body.message}`);
      }
    }

    // 3.3 5 MB + 1 Byte Boundary File (5,242,881 bytes - Oversized by 1 byte)
    {
      const over5MB = 5 * 1024 * 1024 + 1; // 5242881 bytes
      const over5MBBuffer = Buffer.alloc(over5MB, 0x42);
      validJpegHeader.copy(over5MBBuffer, 0);

      const filesBefore = fs.readdirSync(uploadDir);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', over5MBBuffer, 'over_5mb_plus_1b.jpg');

      const filesAfter = fs.readdirSync(uploadDir);
      const residualFiles = filesAfter.filter((f) => !filesBefore.includes(f));

      if (res.status === 400 && res.body.error === 'LIMIT_FILE_SIZE') {
        if (residualFiles.length === 0) {
          logPass('P3.3: 5MB + 1B rejected with LIMIT_FILE_SIZE and ZERO residual files on disk (HTTP 400)');
        } else {
          // Residual partial file leaked
          for (const rf of residualFiles) trackFile(path.resolve(uploadDir, rf));
          logFail('P3.3: 5MB + 1B residual cleanup', `Leaked ${residualFiles.length} residual file(s): ${residualFiles.join(', ')}`);
        }
      } else {
        logFail('P3.3: 5MB + 1B rejection', `Expected 400 LIMIT_FILE_SIZE, got ${res.status}`);
      }
    }

    // 3.4 10 MB Oversized File (10,485,760 bytes)
    {
      const size10MB = 10 * 1024 * 1024;
      const buffer10MB = Buffer.alloc(size10MB, 0x43);
      validJpegHeader.copy(buffer10MB, 0);

      const filesBefore = fs.readdirSync(uploadDir);

      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', buffer10MB, 'oversized_10mb.jpg');

      const filesAfter = fs.readdirSync(uploadDir);
      const residualFiles = filesAfter.filter((f) => !filesBefore.includes(f));

      if (res.status === 400 && res.body.error === 'LIMIT_FILE_SIZE') {
        if (residualFiles.length === 0) {
          logPass('P3.4: 10MB oversized file rejected with LIMIT_FILE_SIZE and clean disk state (HTTP 400)');
        } else {
          for (const rf of residualFiles) trackFile(path.resolve(uploadDir, rf));
          logFail('P3.4: 10MB oversized residual cleanup', `Leaked ${residualFiles.length} residual files`);
        }
      } else {
        logFail('P3.4: 10MB oversized rejection', `Expected 400 LIMIT_FILE_SIZE, got ${res.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // CATEGORY 4: Missing Fields & Malformed Multipart Probes
    // -------------------------------------------------------------------------
    logHeader('4. Missing Fields & Malformed Multipart Probes');

    // 4.1 Empty request body (no file attached)
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.status === 400 && res.body.error === 'FILE_MISSING') {
        logPass('P4.1: Reject request with missing file payload (HTTP 400 FILE_MISSING)');
      } else {
        logFail('P4.1: Reject request with missing file payload', `Expected 400 FILE_MISSING, got ${res.status}`);
      }
    }

    // 4.2 Wrong form field name (e.g. "avatar" or "file" instead of "image")
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('avatar', validJpegHeader, 'avatar.jpg');

      if (res.status === 400 && res.body.error === 'LIMIT_UNEXPECTED_FILE') {
        logPass('P4.2: Reject unexpected form field "avatar" with LIMIT_UNEXPECTED_FILE (HTTP 400)');
      } else {
        logFail('P4.2: Reject unexpected form field', `Expected 400 LIMIT_UNEXPECTED_FILE, got ${res.status}`);
      }
    }

    // 4.3 Valid image alongside extra extraneous text fields & XSS strings
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('productName', 'Silk Hydration Essence')
        .field('price', '140.00')
        .field('xssPayload', '<script>document.location="http://attacker.com"</script>')
        .attach('image', validJpegHeader, 'cream_with_fields.jpg');

      if (res.status === 200 && res.body.success === true && res.body.imageUrl) {
        trackFile(path.resolve(uploadDir, res.body.filename));
        logPass('P4.3: Successfully process image when extraneous form fields and XSS text are passed (HTTP 200)');
      } else {
        logFail('P4.3: Process image with extra fields', `Expected 200, got ${res.status}`);
      }
    }

    // 4.4 Corrupted multipart header with invalid boundary
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'multipart/form-data; boundary=---------------------------CORRUPTED_BOUNDARY')
        .send('THIS IS NOT A VALID MULTIPART STREAM');

      // Should return 400 Bad Request and not crash Express or trigger unhandled 500
      if (res.status === 400 && res.body.success === false) {
        logPass('P4.4: Corrupted multipart body returns clean HTTP 400 without crashing (HTTP 400)');
      } else {
        logFail('P4.4: Corrupted multipart body handling', `Expected 400, got ${res.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // CATEGORY 5: High-Concurrency Resilience (10 Parallel Uploads)
    // -------------------------------------------------------------------------
    logHeader('5. High-Concurrency Resilience Probes (10 Parallel Requests)');

    {
      const CONCURRENCY_COUNT = 10;
      const concurrencyStart = Date.now();

      const uploadPromises = Array.from({ length: CONCURRENCY_COUNT }, (_, index) => {
        // Embed unique byte sequence into each buffer to ensure distinct payloads
        const uniquePayload = Buffer.concat([
          validJpegHeader,
          Buffer.from(`Concurrency probe payload index=${index} timestamp=${Date.now()}`)
        ]);

        return request(app)
          .post('/api/products/upload')
          .set('Authorization', `Bearer ${adminToken}`)
          .attach('image', uniquePayload, `parallel_worker_${index}.jpg`)
          .then((res) => ({ index, res }))
          .catch((err) => ({ index, err }));
      });

      const results = await Promise.all(uploadPromises);
      const concurrencyDuration = Date.now() - concurrencyStart;

      const successfulUploads = results.filter((r) => r.res && r.res.status === 200 && r.res.body.success);
      const returnedFilenames = successfulUploads.map((r) => r.res.body.filename);
      const uniqueFilenames = new Set(returnedFilenames);

      // Track files for teardown
      for (const fname of returnedFilenames) {
        trackFile(path.resolve(uploadDir, fname));
      }

      // Check all exist on disk
      const allExistOnDisk = returnedFilenames.every((fname) => fs.existsSync(path.resolve(uploadDir, fname)));

      if (successfulUploads.length === CONCURRENCY_COUNT) {
        logPass(`P5.1: 10/10 concurrent uploads succeeded (100% success rate)`, `${concurrencyDuration}ms total`);
      } else {
        logFail('P5.1: 10 concurrent uploads success rate', `Only ${successfulUploads.length}/${CONCURRENCY_COUNT} succeeded`);
      }

      if (uniqueFilenames.size === CONCURRENCY_COUNT) {
        logPass(`P5.2: 10/10 generated filenames strictly unique (Zero collisions)`, `10 unique filenames`);
      } else {
        logFail('P5.2: Collision resistance under concurrency', `Expected 10 unique, got ${uniqueFilenames.size}`);
      }

      if (allExistOnDisk) {
        logPass(`P5.3: All 10 parallel uploaded files physically confirmed on disk`);
      } else {
        logFail('P5.3: Disk existence check for concurrent uploads', 'One or more files missing from disk');
      }
    }

    // -------------------------------------------------------------------------
    // CATEGORY 6: Static Asset Serving & Protection Probes
    // -------------------------------------------------------------------------
    logHeader('6. Static Asset Serving & Protection Probes');

    // 6.1 Upload and statically serve valid PNG
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validPngHeader, 'luxury_serum.png');

      if (res.status === 200 && res.body.imageUrl) {
        trackFile(path.resolve(uploadDir, res.body.filename));
        const staticRes = await request(app).get(res.body.imageUrl);

        if (staticRes.status === 200 && staticRes.headers['content-type'].includes('image/png')) {
          logPass('P6.1: Uploaded PNG statically served with HTTP 200 and image/png Content-Type', res.body.imageUrl);
        } else {
          logFail('P6.1: Static serving of PNG', `Expected 200 image/png, got ${staticRes.status} ${staticRes.headers['content-type']}`);
        }
      } else {
        logFail('P6.1: PNG upload before static serve test', `Expected 200, got ${res.status}`);
      }
    }

    // 6.2 Upload and statically serve valid WebP
    {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', validWebpHeader, 'velvet_mist.webp');

      if (res.status === 200 && res.body.imageUrl) {
        trackFile(path.resolve(uploadDir, res.body.filename));
        const staticRes = await request(app).get(res.body.imageUrl);

        if (staticRes.status === 200 && staticRes.headers['content-type'].includes('image/webp')) {
          logPass('P6.2: Uploaded WebP statically served with HTTP 200 and image/webp Content-Type', res.body.imageUrl);
        } else {
          logFail('P6.2: Static serving of WebP', `Expected 200 image/webp, got ${staticRes.status} ${staticRes.headers['content-type']}`);
        }
      } else {
        logFail('P6.2: WebP upload before static serve test', `Expected 200, got ${res.status}`);
      }
    }

    // 6.3 Path traversal defense on static endpoint
    {
      // Attempting to read package.json via directory traversal in URL path
      const resTraversal = await request(app).get('/assets/images/products/../../package.json');

      // express.static should normalize the path or reject traversal
      // If it serves package.json, the content-type would be application/json and contain "velvetaura"
      const leakedPackage = resTraversal.text && resTraversal.text.includes('"name": "velvetaura"') && resTraversal.headers['content-type'].includes('json');

      if (!leakedPackage) {
        logPass('P6.3: Path traversal on static endpoint blocked: sensitive files outside public cannot be read', `Status: ${resTraversal.status}`);
      } else {
        logFail('P6.3: Path traversal on static endpoint', 'CRITICAL: package.json leaked through static path traversal!');
      }
    }

    // 6.4 Non-existent asset request fallback stability
    {
      const res = await request(app).get('/assets/images/products/non_existent_image_99999.jpg');

      // In app.js, unmatched non-API routes fall through to SPA fallback (HTTP 200 with index.html) or 404
      if (res.status === 200 || res.status === 404) {
        logPass('P6.4: Non-existent image URL handled gracefully without server exception', `Status: ${res.status}`);
      } else {
        logFail('P6.4: Non-existent image URL handling', `Unexpected status: ${res.status}`);
      }
    }

  } catch (fatalError) {
    console.error(`\n${colors.red}${colors.bold}FATAL EXCEPTION DURING HARNESS EXECUTION:${colors.reset}`, fatalError);
    stats.failures.push({ probeName: 'Harness Execution', errorDetail: fatalError.message });
    stats.failed++;
  } finally {
    // -------------------------------------------------------------------------
    // CATEGORY 7: Teardown & Guaranteed Disk Cleanup
    // -------------------------------------------------------------------------
    logHeader('7. Test Teardown & Disk Cleanup Verification');

    let cleanedCount = 0;
    for (const filePath of stats.createdFiles) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          cleanedCount++;
        } catch (unlinkErr) {
          console.warn(`[Cleanup Warning] Could not delete ${filePath}: ${unlinkErr.message}`);
        }
      }
    }
    logPass(`P7.1: Cleaned up ${cleanedCount} temporary test image file(s) from ${uploadDir}`);

    try {
      await disconnectDB();
      logPass('P7.2: Closed MongoDB in-memory database connection cleanly');
    } catch (dbErr) {
      console.warn(`[DB Teardown Warning] ${dbErr.message}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${colors.bold}======================================================================${colors.reset}`);
    console.log(`${colors.bold}                       STRESS TEST SUMMARY REPORT                     ${colors.reset}`);
    console.log(`${colors.bold}======================================================================${colors.reset}`);
    console.log(`Total Probes Executed : ${stats.total}`);
    console.log(`Probes Passed         : ${colors.green}${stats.passed}${colors.reset}`);
    console.log(`Probes Failed         : ${stats.failed > 0 ? colors.red : colors.green}${stats.failed}${colors.reset}`);
    console.log(`Elapsed Time          : ${duration}s`);
    console.log(`Verdict               : ${stats.failed === 0 ? colors.green + colors.bold + 'APPROVE' : colors.red + colors.bold + 'FAIL'}${colors.reset}`);
    console.log(`${colors.bold}======================================================================${colors.reset}\n`);

    if (stats.failed > 0) {
      console.error(`${colors.red}Failures encountered:${colors.reset}`);
      stats.failures.forEach((f, idx) => {
        console.error(`  ${idx + 1}. [${f.probeName}]: ${f.errorDetail}`);
      });
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runAdversarialStressSuite();
}

module.exports = { runAdversarialStressSuite };
