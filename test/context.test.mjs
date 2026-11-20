import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../scripts/lib/ansi.mjs';
import {
  contextIcon,
  contextTone,
  formatTokens,
  parseContextWindow,
  renderContextLine,
} from '../scripts/lib/context.mjs';

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

test('parseContextWindow falls back cleanly across fields', () => {
  assert.deepEqual(parseContextWindow({}), {
    usedPct: 0,
    windowSize: 0,
    usedTokens: 0,
  });

  const fromRemaining = parseContextWindow({
    context_window: {
      context_window_size: 1000000,
      remaining_percentage: 25,
    },
  });
  assert.equal(fromRemaining.usedPct, 75);
  assert.equal(fromRemaining.usedTokens, 750000);

  const fromTotals = parseContextWindow({
    context_window: {
      context_window_size: 200000,
      total_input_tokens: 150000,
      total_output_tokens: 30000,
    },
  });
  assert.equal(fromTotals.usedPct, 90);
});

test('renderContextLine colors bar by threshold and formats icon and token summary', () => {
  assert.equal(formatTokens(1048576), '1M');
  assert.equal(formatTokens(149000), '149k');

  const greenLine = renderContextLine({
    context_window: { context_window_size: 1048576, used_percentage: 42 },
  });
  assert.ok(greenLine.includes('48;2;39;133;99'));
  assert.match(stripAnsi(greenLine), /^◑ 上下文 .*42%.* 440k\/1M$/);

  const yellowLine = renderContextLine({
    context_window: { context_window_size: 1048576, used_percentage: 70 },
  });
  assert.ok(yellowLine.includes('48;2;201;138;30'));
  assert.match(stripAnsi(yellowLine), /^◕ 上下文/);

  const redLine = renderContextLine({
    context_window: { context_window_size: 1048576, used_percentage: 90 },
  });
  assert.ok(redLine.includes('48;2;199;68;84'));
  assert.match(stripAnsi(redLine), /^● 上下文/);

  const hiddenTokens = renderContextLine(
    { context_window: { context_window_size: 1048576, used_percentage: 75 } },
    { showTokens: false, noColor: true }
  );
  assert.ok(!hiddenTokens.includes('/1M'));
  assert.ok(hiddenTokens.includes('75%'));
});
