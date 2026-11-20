import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripAnsi } from '../scripts/lib/ansi.mjs';
import { syncQuotaPayload } from '../scripts/lib/quotaSync.mjs';

const SCRIPT_PATH = fileURLToPath(
  new URL('../scripts/statusline.mjs', import.meta.url)
);

function withTempCache(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-sync-'));
  const cachePath = path.join(dir, 'quota-sync.json');
  try {
    return fn(cachePath, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('syncQuotaPayload syncs fresher lower quota to stale idle session in same window', () => {
  withTempCache((cachePath) => {
    const now0 = Date.parse('2026-11-20T10:00:00Z');
    const resetIso = '2026-11-20T15:00:00Z';

    const activePayload = {
      email: 'alice@example.com',
      quota: {
        'gemini-5h': {
          remaining_fraction: 0.82,
          reset_time: resetIso,
          reset_in_seconds: 18000,
        },
      },
    };
    const resA = syncQuotaPayload(activePayload, { nowMs: now0, cachePath });
    assert.equal(resA.quota['gemini-5h'].remaining_fraction, 0.82);

    // 2 minutes later, stale Session B still passes old 0.96 snapshot
    const now1 = now0 + 120_000;
    const stalePayload = {
      email: 'alice@example.com',
      quota: {
        'gemini-5h': {
          remaining_fraction: 0.96,
          reset_time: resetIso,
          reset_in_seconds: 18000,
        },
      },
    };
    const resB = syncQuotaPayload(stalePayload, { nowMs: now1, cachePath });
    assert.equal(resB.quota['gemini-5h'].remaining_fraction, 0.82);
    assert.equal(resB.quota['gemini-5h'].reset_in_seconds, 18000 - 120);
  });
});

test('syncQuotaPayload protects active consumption from idle 100% sliding reset timers', () => {
  withTempCache((cachePath) => {
    const now0 = Date.parse('2026-11-20T10:00:00Z');
    syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.92,
            reset_time: '2026-11-20T15:00:00Z',
          },
        },
      },
      { nowMs: now0, cachePath }
    );

    const idleB = syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 1.0,
            reset_time: '2026-11-20T15:10:00Z',
          },
        },
      },
      { nowMs: now0 + 60_000, cachePath }
    );

    assert.equal(idleB.quota['gemini-5h'].remaining_fraction, 0.92);
    assert.equal(idleB.quota['gemini-5h'].reset_time, '2026-11-20T15:00:00Z');
  });
});

test('syncQuotaPayload resets cleanly when cached reset window expires', () => {
  withTempCache((cachePath) => {
    const now0 = Date.parse('2026-11-20T10:00:00Z');
    syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.78,
            reset_time: '2026-11-20T15:00:00Z',
          },
        },
      },
      { nowMs: now0, cachePath }
    );

    const afterReset = Date.parse('2026-11-20T15:01:00Z');
    const fresh = syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 1.0,
            reset_time: '2026-11-20T20:01:00Z',
          },
        },
      },
      { nowMs: afterReset, cachePath }
    );

    assert.equal(fresh.quota['gemini-5h'].remaining_fraction, 1.0);
    assert.equal(fresh.quota['gemini-5h'].reset_time, '2026-11-20T20:01:00Z');
  });
});

test('syncQuotaPayload helps sleeping session adopt fresh window over expired snapshot', () => {
  withTempCache((cachePath) => {
    const now1 = Date.parse('2026-11-20T15:05:00Z');
    syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 1.0,
            reset_time: '2026-11-20T20:05:00Z',
          },
        },
      },
      { nowMs: now1, cachePath }
    );

    const sleeping = syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.78,
            reset_time: '2026-11-20T15:00:00Z',
          },
        },
      },
      { nowMs: now1 + 10_000, cachePath }
    );

    assert.equal(sleeping.quota['gemini-5h'].remaining_fraction, 1.0);
    assert.equal(sleeping.quota['gemini-5h'].reset_time, '2026-11-20T20:05:00Z');
  });
});

test('syncQuotaPayload isolates accounts by email and never fabricates empty quota', () => {
  withTempCache((cachePath) => {
    const nowMs = Date.parse('2026-11-20T10:00:00Z');
    syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.4,
            reset_time: '2026-11-20T15:00:00Z',
          },
        },
      },
      { nowMs, cachePath }
    );

    const bob = syncQuotaPayload(
      {
        email: 'bob@example.com',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.95,
            reset_time: '2026-11-20T15:00:00Z',
          },
        },
      },
      { nowMs, cachePath }
    );
    assert.equal(bob.quota['gemini-5h'].remaining_fraction, 0.95);

    const apiKeyPayload = { email: 'alice@example.com', context_window: { used_percentage: 10 } };
    const untouched = syncQuotaPayload(apiKeyPayload, { nowMs, cachePath });
    assert.equal(untouched.quota, undefined);
  });
});

test('syncQuotaPayload fails open on corrupted cache or unwritable path and honors enabled=false', () => {
  withTempCache((cachePath, dir) => {
    const nowMs = Date.parse('2026-11-20T10:00:00Z');
    fs.writeFileSync(cachePath, '{not-valid-json', 'utf8');

    const recovered = syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: { 'gemini-5h': { remaining_fraction: 0.65, reset_in_seconds: 3600 } },
      },
      { nowMs, cachePath }
    );
    assert.equal(recovered.quota['gemini-5h'].remaining_fraction, 0.65);

    const blockedPath = path.join(dir, 'blocker-file');
    fs.writeFileSync(blockedPath, 'x');
    const unwritable = syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: { 'gemini-5h': { remaining_fraction: 0.55, reset_in_seconds: 3600 } },
      },
      { nowMs, cachePath: path.join(blockedPath, 'nested.json') }
    );
    assert.equal(unwritable.quota['gemini-5h'].remaining_fraction, 0.55);

    const bypassed = syncQuotaPayload(
      {
        email: 'alice@example.com',
        quota: { 'gemini-5h': { remaining_fraction: 0.99, reset_in_seconds: 3600 } },
      },
      { nowMs, cachePath, enabled: false }
    );
    assert.equal(bypassed.quota['gemini-5h'].remaining_fraction, 0.99);
  });
});

test('statusline.mjs CLI syncs fresher quota between two separate processes', () => {
  withTempCache((cachePath) => {
    const env = {
      ...process.env,
      NO_COLOR: '',
      AGY_HUD_QUOTA_CACHE_PATH: cachePath,
      AGY_HUD_QUOTA_SYNC: '1',
    };

    execFileSync(process.execPath, [SCRIPT_PATH], {
      input: JSON.stringify({
        email: 'alice@example.com',
        quota: { 'gemini-5h': { remaining_fraction: 0.82, reset_in_seconds: 7200 } },
        context_window: { context_window_size: 1000000, used_percentage: 30 },
      }),
      encoding: 'utf8',
      env,
    });

    const outB = execFileSync(process.execPath, [SCRIPT_PATH], {
      input: JSON.stringify({
        email: 'alice@example.com',
        quota: { 'gemini-5h': { remaining_fraction: 0.96, reset_in_seconds: 7200 } },
        context_window: { context_window_size: 1000000, used_percentage: 5 },
      }),
      encoding: 'utf8',
      env,
    });

    const plainB = stripAnsi(outB);
    assert.ok(plainB.includes('82%'), `Session B should display synced 82%, got:\n${plainB}`);
    assert.ok(plainB.includes('5%'), 'Session B should keep its own 5% context usage');
  });
});
