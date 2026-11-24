import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../scripts/lib/ansi.mjs';
import {
  DEFAULT_COMPACT_LIMIT,
  contextIcon,
  contextTone,
  formatTokens,
  parseCompactLimitValue,
  parseContextWindow,
  renderContextLine,
} from '../scripts/lib/context.mjs';

delete process.env.AGY_HUD_COMPACT_LIMIT;
delete process.env.AGY_CLI_AUTO_COMPACT_OVERRIDE;

const NO_ENV = { env: {} };

test('contextTone enforces 70% yellow and 90% red thresholds', () => {
  assert.equal(contextTone(0), 'green');
  assert.equal(contextTone(69.9), 'green');
  assert.equal(contextTone(70), 'yellow');
  assert.equal(contextTone(70.1), 'yellow');
  assert.equal(contextTone(89.9), 'yellow');
  assert.equal(contextTone(90), 'red');
  assert.equal(contextTone(90.1), 'red');
  assert.equal(contextTone(100), 'red');
});

test('contextIcon maps utilization ranges to quadrant gauge icons', () => {
  assert.equal(contextIcon(0), '○');
  assert.equal(contextIcon(17.9), '◔');
  assert.equal(contextIcon(42), '◑');
  assert.equal(contextIcon(75), '◕');
  assert.equal(contextIcon(95), '●');
});

test('parseCompactLimitValue accepts counts, K/M shorthands, percentages, and rejects junk', () => {
  assert.equal(parseCompactLimitValue(700000), 700000);
  assert.equal(parseCompactLimitValue('700000'), 700000);
  assert.equal(parseCompactLimitValue('256k'), 256000);
  assert.equal(parseCompactLimitValue('800K'), 800000);
  assert.equal(parseCompactLimitValue('0.5M'), 500000);
  assert.equal(parseCompactLimitValue('1.5m'), 1500000);
  assert.equal(parseCompactLimitValue(' 80% ', 1000000), 800000);
  assert.equal(parseCompactLimitValue('80%'), null);
  for (const bad of ['', '0', '-5', 'abc', 'off', null, undefined, 0, -1, NaN, {}]) {
    assert.equal(parseCompactLimitValue(bad, 1000000), null, `should reject ${String(bad)}`);
  }
});

test('parseContextWindow falls back cleanly across fields', () => {
  assert.deepEqual(parseContextWindow({}, NO_ENV), {
    usedPct: 0,
    rawUsedPct: 0,
    windowSize: 0,
    effectiveLimit: 0,
    usedTokens: 0,
    limitSource: 'none',
  });

  const fromRemaining = parseContextWindow(
    { context_window: { context_window_size: 1000000, remaining_percentage: 25 } },
    { env: { AGY_HUD_COMPACT_LIMIT: 'off' } }
  );
  assert.equal(fromRemaining.usedPct, 75);
  assert.equal(fromRemaining.usedTokens, 750000);
  assert.equal(fromRemaining.limitSource, 'model');

  const fromTotals = parseContextWindow(
    {
      context_window: {
        context_window_size: 200000,
        total_input_tokens: 150000,
        total_output_tokens: 30000,
      },
    },
    NO_ENV
  );
  assert.equal(fromTotals.usedPct, 90);
  assert.equal(fromTotals.effectiveLimit, 200000);
  assert.equal(fromTotals.limitSource, 'model');
});

test('parseContextWindow measures large-window models against the 512k default ceiling', () => {
  assert.equal(DEFAULT_COMPACT_LIMIT, 512000);

  for (const size of [1048576, 1000000]) {
    const empty = parseContextWindow(
      { context_window: { context_window_size: size, used_percentage: 0 } },
      NO_ENV
    );
    assert.equal(empty.effectiveLimit, 512000);
    assert.equal(empty.usedPct, 0);
    assert.equal(empty.limitSource, 'default');
  }

  const mid = parseContextWindow(
    { context_window: { context_window_size: 1000000, used_percentage: 25.6 } },
    NO_ENV
  );
  assert.equal(mid.usedTokens, 256000);
  assert.equal(mid.usedPct, 50);
  assert.equal(mid.rawUsedPct, 25.6);

  const overflow = parseContextWindow(
    { context_window: { context_window_size: 1000000, remaining_percentage: 25 } },
    NO_ENV
  );
  assert.equal(overflow.usedTokens, 750000);
  assert.equal(overflow.usedPct, 100);

  const direct = parseContextWindow(
    { context_window: { context_window_size: 1048576, estimated_tokens_used: 256000 } },
    NO_ENV
  );
  assert.equal(direct.usedTokens, 256000);
  assert.equal(direct.usedPct, 50);

  const small = parseContextWindow(
    { context_window: { context_window_size: 200000, used_percentage: 40 } },
    NO_ENV
  );
  assert.equal(small.effectiveLimit, 200000);
  assert.equal(small.usedPct, 40);
  assert.equal(small.limitSource, 'model');

  const unknownWindow = parseContextWindow({ context_window: { used_percentage: 12 } }, NO_ENV);
  assert.equal(unknownWindow.effectiveLimit, 0);
  assert.equal(unknownWindow.usedPct, 12);
});

test('parseContextWindow honors payload, HUD env, CLI env, and disable precedence', () => {
  const base = { context_window_size: 1048576, used_percentage: 50 };

  const cli = parseContextWindow({ context_window: base }, {
    env: { AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K' },
  });
  assert.equal(cli.effectiveLimit, 800000);
  assert.equal(cli.limitSource, 'cli_env');
  assert.equal(cli.usedTokens, 524288);
  assert.ok(Math.abs(cli.usedPct - 65.536) < 1e-9);

  const cliPct = parseContextWindow({ context_window: base }, {
    env: { AGY_CLI_AUTO_COMPACT_OVERRIDE: '80%' },
  });
  assert.equal(cliPct.effectiveLimit, Math.round(0.8 * 1048576));

  const hudBeatsCli = parseContextWindow({ context_window: base }, {
    env: { AGY_HUD_COMPACT_LIMIT: '300k', AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K' },
  });
  assert.equal(hudBeatsCli.effectiveLimit, 300000);
  assert.equal(hudBeatsCli.limitSource, 'hud_env');

  const payloadBeatsEnv = parseContextWindow(
    { context_window: { ...base, max_context_tokens: 256000 } },
    { env: { AGY_HUD_COMPACT_LIMIT: '700k', AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K' } }
  );
  assert.equal(payloadBeatsEnv.effectiveLimit, 256000);
  assert.equal(payloadBeatsEnv.limitSource, 'payload');
  assert.equal(payloadBeatsEnv.usedPct, 100);

  for (const key of ['auto_compact_limit', 'compaction_threshold', 'auto_compact_threshold']) {
    const viaKey = parseContextWindow({ context_window: { ...base, [key]: 400000 } }, NO_ENV);
    assert.equal(viaKey.effectiveLimit, 400000, key);
    assert.equal(viaKey.limitSource, 'payload', key);
  }

  for (const off of ['off', '0', 'OFF', 'raw', 'model']) {
    const disabled = parseContextWindow(
      { context_window: { ...base, max_context_tokens: 256000 } },
      { env: { AGY_HUD_COMPACT_LIMIT: off, AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K' } }
    );
    assert.equal(disabled.effectiveLimit, 1048576, off);
    assert.equal(disabled.usedPct, 50, off);
    assert.equal(disabled.limitSource, 'model', off);
  }

  const clamped = parseContextWindow(
    { context_window: { context_window_size: 200000, used_percentage: 50 } },
    { env: { AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K' } }
  );
  assert.equal(clamped.effectiveLimit, 200000);
  assert.equal(clamped.usedPct, 50);

  const viaOption = parseContextWindow({ context_window: base }, { env: {}, compactLimit: '256k' });
  assert.equal(viaOption.effectiveLimit, 256000);
  const optionOff = parseContextWindow({ context_window: base }, {
    env: { AGY_HUD_COMPACT_LIMIT: '256k' },
    compactLimit: 'off',
  });
  assert.equal(optionOff.effectiveLimit, 1048576);

  const invalidHud = parseContextWindow({ context_window: base }, {
    env: { AGY_HUD_COMPACT_LIMIT: 'garbage', AGY_CLI_AUTO_COMPACT_OVERRIDE: '600K' },
  });
  assert.equal(invalidHud.effectiveLimit, 600000);
  assert.equal(invalidHud.limitSource, 'cli_env');
});

test('renderContextLine colors bar by threshold and formats icon and token summary', () => {
  assert.equal(formatTokens(1048576), '1M');
  assert.equal(formatTokens(149000), '149k');

  const greenLine = renderContextLine(
    { context_window: { context_window_size: 1048576, used_percentage: 20.5 } },
    NO_ENV
  );
  assert.ok(greenLine.includes('48;2;39;133;99'));
  assert.match(stripAnsi(greenLine), /^◑ 上下文 .*42%.* 215k\/512k$/);

  const yellowLine = renderContextLine(
    { context_window: { context_window_size: 1048576, used_percentage: 36.6 } },
    NO_ENV
  );
  assert.ok(yellowLine.includes('48;2;201;138;30'));
  assert.match(stripAnsi(yellowLine), /^◕ 上下文 .*75%.* 384k\/512k$/);

  const redLine = renderContextLine(
    { context_window: { context_window_size: 1048576, used_percentage: 45.9 } },
    NO_ENV
  );
  assert.ok(redLine.includes('48;2;199;68;84'));
  assert.match(stripAnsi(redLine), /^● 上下文 .*94%.* 481k\/512k$/);

  const hiddenTokens = renderContextLine(
    { context_window: { context_window_size: 200000, used_percentage: 75 } },
    { showTokens: false, noColor: true, env: {} }
  );
  assert.ok(!hiddenTokens.includes('/200k'));
  assert.ok(hiddenTokens.includes('75%'));

  const rawWindow = renderContextLine(
    { context_window: { context_window_size: 1048576, used_percentage: 42 } },
    { env: { AGY_HUD_COMPACT_LIMIT: 'off' } }
  );
  assert.match(stripAnsi(rawWindow), /^◑ 上下文 .*42%.* 440k\/1M$/);

  const noWindow = stripAnsi(renderContextLine({}, NO_ENV));
  assert.match(noWindow, /^○ 上下文 .*0%/);
  assert.ok(!noWindow.includes('/'));
});
