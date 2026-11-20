import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../scripts/lib/ansi.mjs';
import {
  classifyQuotaKey,
  formatCountdown,
  parseQuotaPools,
  quotaTone,
  renderQuotaLine,
} from '../scripts/lib/quota.mjs';

test('formatCountdown formats seconds into compact durations', () => {
  assert.equal(formatCountdown(null), '');
  assert.equal(formatCountdown(0), '0m');
  assert.equal(formatCountdown(30), '<1m');
  assert.equal(formatCountdown(45 * 60), '45m');
  assert.equal(formatCountdown(2 * 3600 + 15 * 60), '2h15m');
  assert.equal(formatCountdown(4 * 86400 + 12 * 3600), '4d12h');
  assert.equal(formatCountdown(3 * 86400), '3d');
});

test('classifyQuotaKey distinguishes pools, Claude/GPT label, icons, and windows cleanly', () => {
  assert.deepEqual(classifyQuotaKey('gemini-5h'), {
    poolId: 'gemini',
    poolLabel: 'Gemini',
    poolIcon: '✦',
    poolColor: [125, 207, 255],
    priority: 10,
    windowType: '5h',
    windowLabel: '5h',
    windowOrder: 1,
  });
  assert.deepEqual(classifyQuotaKey('3p-weekly'), {
    poolId: '3p',
    poolLabel: 'Claude/GPT',
    poolIcon: '◈',
    poolColor: [187, 154, 247],
    priority: 20,
    windowType: 'weekly',
    windowLabel: '周',
    windowOrder: 3,
  });
  assert.deepEqual(classifyQuotaKey('gemini-argon-wtu-weekly'), {
    poolId: 'argon',
    poolLabel: 'Argon',
    poolIcon: '◆',
    poolColor: [247, 118, 142],
    priority: 30,
    windowType: 'weekly',
    windowLabel: '周',
    windowOrder: 3,
  });
  assert.deepEqual(classifyQuotaKey('custom-pool-5hr'), {
    poolId: 'custom-pool',
    poolLabel: 'Custom Pool',
    poolIcon: '◇',
    poolColor: [122, 162, 247],
    priority: 50,
    windowType: '5h',
    windowLabel: '5h',
    windowOrder: 1,
  });
});

test('parseQuotaPools groups multi-pool buckets, resolves reset_time, and skips disabled', () => {
  const nowMs = Date.parse('2026-11-20T10:00:00Z');
  const pools = parseQuotaPools(
    {
      '3p-weekly': {
        remaining_fraction: 0.8,
        reset_time: '2026-11-23T15:00:00Z',
      },
      'gemini-weekly': {
        remaining_fraction: 0.92,
        reset_in_seconds: 388800,
      },
      'gemini-5h': {
        remaining_fraction: 0.85,
        reset_in_seconds: 8100,
      },
      'disabled-pool-5h': {
        remaining_fraction: 0.5,
        disabled: true,
      },
    },
    { nowMs }
  );

  assert.equal(pools.length, 2);
  assert.equal(pools[0].poolLabel, 'Gemini');
  assert.deepEqual(
    pools[0].windows.map((w) => w.windowType),
    ['5h', 'weekly']
  );
  assert.equal(pools[1].poolLabel, 'Claude/GPT');
  assert.equal(pools[1].windows[0].resetSeconds, 3 * 86400 + 5 * 3600);
});

test('quotaTone switches color at <30% yellow and <10% red', () => {
  assert.equal(quotaTone(50), 'green');
  assert.equal(quotaTone(30), 'green');
  assert.equal(quotaTone(29.9), 'yellow');
  assert.equal(quotaTone(10), 'yellow');
  assert.equal(quotaTone(9.9), 'red');
  assert.equal(quotaTone(0), 'red');
});

test('renderQuotaLine renders separate pools with icons, countdowns, and empty fallback', () => {
  const empty = renderQuotaLine({}, { noColor: true });
  assert.equal(empty, '◇ 额度 暂无数据');

  const line = renderQuotaLine(
    {
      quota: {
        'gemini-5h': { remaining_fraction: 0.85, reset_in_seconds: 8100 },
        'gemini-weekly': { remaining_fraction: 0.25, reset_in_seconds: 388800 },
        '3p-5h': { remaining_fraction: 0.05, reset_in_seconds: 1800 },
      },
    },
    { barWidth: 8 }
  );

  const plain = stripAnsi(line);
  assert.match(
    plain,
    /✦ Gemini 5h .*85%.* ↻2h15m 周 .*25%.* ↻4d12h │ ◈ Claude\/GPT 5h .*5%.* ↻30m/
  );
  assert.ok(line.includes('48;2;39;133;99'), '85% should use green TrueColor bg');
  assert.ok(line.includes('48;2;201;138;30'), '25% should use yellow TrueColor bg');
  assert.ok(line.includes('38;2;199;68;84'), '5% sub-cell bar should render red TrueColor fractional fill');
  assert.ok(!line.includes('\x1b[2m'), 'should avoid DIM stacking');
});
