#!/usr/bin/env node
/**
 * VelvetAura Standalone E2E Test Runner
 * Executes Tier 1-4 opaque-box test suites against in-process app or live server.
 *
 * Usage:
 *   node tests/e2e/runner.js
 *   BASE_URL=http://localhost:5000 node tests/e2e/runner.js
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

process.env.NODE_ENV = 'test';

// Parse CLI flags
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base-url' && args[i + 1]) {
    process.env.BASE_URL = args[i + 1];
    i++;
  }
}

const testSuites = [
  { name: 'Tier 1: Authentication & User Management', file: './tier1_auth.test.js' },
  { name: 'Tier 1: Product Catalog & Discovery', file: './tier1_catalog.test.js' },
  { name: 'Tier 1: Cart Management & Pricing Engine', file: './tier1_cart.test.js' },
  { name: 'Tier 1: Order Creation & Mock Payment', file: './tier1_order.test.js' },
  { name: 'Tier 1: Health & Database Mode Routing', file: './tier1_health.test.js' },
  { name: 'Tier 2: Boundary & Corner Cases', file: './tier2_boundary.test.js' },
  { name: 'Tier 3: Cross-Feature Pairwise Interactions', file: './tier3_interactions.test.js' },
  { name: 'Tier 4: Real-World Luxury Beauty Shopping Scenarios', file: './tier4_scenarios.test.js' }
];

console.log('\n===============================================================');
console.log('              VelvetAura E2E Opaque-Box Test Suite              ');
console.log('===============================================================');
console.log(`Execution Mode : ${process.env.BASE_URL ? `Live Network (${process.env.BASE_URL})` : 'In-Process (Express + Dual-Mode DB)'}`);
console.log(`Suites Planned : ${testSuites.length}`);
console.log(`Working Dir    : ${process.cwd()}\n`);

// Check if Jest is installed locally
const localJestPath = path.resolve(__dirname, '../../node_modules/.bin/jest');
const isWindows = process.platform === 'win32';
const jestCmd = isWindows ? `${localJestPath}.cmd` : localJestPath;

if (fs.existsSync(jestCmd)) {
  console.log(`[Runner] Launching Jest runner: ${jestCmd}`);
  const configPath = path.resolve(__dirname, 'jest.e2e.config.js');
  const jestProcess = spawn(jestCmd, ['--config', configPath, '--runInBand', '--colors'], {
    stdio: 'inherit',
    shell: isWindows,
    env: process.env
  });

  jestProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
} else {
  // Execute via internal test harness if Jest CLI is not yet installed
  runStandaloneHarness();
}

async function runStandaloneHarness() {
  console.log('[Runner] Running via built-in opaque-box test runner harness...\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  const startTime = Date.now();

  for (const suite of testSuites) {
    console.log(`---------------------------------------------------------------`);
    console.log(`Running: ${suite.name}`);
    console.log(`File   : ${suite.file}`);
    console.log(`---------------------------------------------------------------`);

    const suitePath = path.resolve(__dirname, suite.file);
    if (!fs.existsSync(suitePath)) {
      console.error(`[ERROR] Test file not found: ${suitePath}`);
      totalFailed++;
      continue;
    }

    // Set up standalone test environment
    const testFns = [];
    let beforeAllFn = null;
    let afterAllFn = null;

    global.describe = (desc, fn) => {
      fn();
    };

    global.beforeAll = (fn) => {
      beforeAllFn = fn;
    };

    global.afterAll = (fn) => {
      afterAllFn = fn;
    };

    global.test = (name, fn) => {
      testFns.push({ name, fn });
    };

    global.it = global.test;

    global.expect = (actual) => ({
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toContain: (item) => {
        if (Array.isArray(actual)) {
          if (!actual.includes(item)) {
            throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
          }
        } else if (typeof actual === 'string') {
          if (!actual.includes(item)) {
            throw new Error(`Expected string "${actual}" to contain "${item}"`);
          }
        } else {
          throw new Error(`toContain called on unsupported type: ${typeof actual}`);
        }
      },
      toBeDefined: () => {
        if (actual === undefined) {
          throw new Error(`Expected value to be defined, but received undefined`);
        }
      },
      toBeUndefined: () => {
        if (actual !== undefined) {
          throw new Error(`Expected value to be undefined, but received ${JSON.stringify(actual)}`);
        }
      },
      toBeGreaterThan: (n) => {
        if (!(actual > n)) {
          throw new Error(`Expected ${actual} to be greater than ${n}`);
        }
      },
      toBeGreaterThanOrEqual: (n) => {
        if (!(actual >= n)) {
          throw new Error(`Expected ${actual} to be >= ${n}`);
        }
      },
      toBeCloseTo: (expected, precision = 2) => {
        const diff = Math.abs(actual - expected);
        const tolerance = Math.pow(10, -precision) / 2;
        if (diff > tolerance) {
          throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff}, tolerance: ${tolerance})`);
        }
      },
      toMatch: (regex) => {
        if (!regex.test(actual)) {
          throw new Error(`Expected "${actual}" to match regex ${regex}`);
        }
      }
    });

    try {
      // Require the test suite
      delete require.cache[require.resolve(suitePath)];
      require(suitePath);

      if (beforeAllFn) {
        await beforeAllFn();
      }

      for (const t of testFns) {
        totalTests++;
        const tStart = Date.now();
        try {
          await t.fn();
          const tDuration = Date.now() - tStart;
          console.log(`  ✓ ${t.name} (${tDuration}ms)`);
          totalPassed++;
        } catch (err) {
          const tDuration = Date.now() - tStart;
          console.error(`  ✗ ${t.name} (${tDuration}ms)`);
          console.error(`    -> ${err.message}`);
          totalFailed++;
        }
      }

      if (afterAllFn) {
        await afterAllFn();
      }
    } catch (suiteErr) {
      console.error(`  [SUITE ERROR] Failure during suite execution: ${suiteErr.message}`);
      totalFailed++;
    }

    console.log('');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('===============================================================');
  console.log('                     E2E Suite Summary                         ');
  console.log('===============================================================');
  console.log(`Total Tests Run : ${totalTests}`);
  console.log(`Passed          : ${totalPassed}`);
  console.log(`Failed          : ${totalFailed}`);
  console.log(`Duration        : ${elapsed}s`);
  console.log('===============================================================\n');

  if (totalFailed > 0) {
    console.error(`[E2E Runner] Suite finished with ${totalFailed} failure(s).`);
    process.exit(1);
  } else {
    console.log('[E2E Runner] All E2E test suites passed successfully!');
    process.exit(0);
  }
}
