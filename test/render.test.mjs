import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { displayWidth, stripAnsi } from '../scripts/lib/ansi.mjs';
import { renderHud } from '../scripts/lib/render.mjs';

delete process.env.AGY_HUD_COMPACT_LIMIT;
delete process.env.AGY_CLI_AUTO_COMPACT_OVERRIDE;

const SCRIPT_PATH = fileURLToPath(
  new URL('../scripts/statusline.mjs', import.meta.url)
);

const SAMPLE_PAYLOAD = {
  terminal_width: 140,
  model: {
    id: 'Gemini 4 Argon (High)',
    display_name: 'Gemini 4 Argon (High)',
    effort: 'high',
  },
  quota: {
    'gemini-5h': { remaining_fraction: 0.88, reset_in_seconds: 7200 },
    'gemini-weekly': { remaining_fraction: 0.91, reset_in_seconds: 172800 },
    '3p-5h': { remaining_fraction: 0.65, reset_in_seconds: 3600 },
    '3p-weekly': { remaining_fraction: 0.72, reset_in_seconds: 259200 },
  },
  context_window: {
    context_window_size: 1000000,
    used_percentage: 36.864,
  },
  subagents: [{ name: 'research', status: 'running' }],
  task_count: 2,
};

test('renderHud renders full-height 3-row transparent pixel-art Google alongside metrics', () => {
  const out = renderHud(SAMPLE_PAYLOAD, { nowMs: 0 });
  const lines = out.split('\n');
  assert.equal(lines.length, 3);

  const plain0 = stripAnsi(lines[0]);
  const plain1 = stripAnsi(lines[1]);
  const plain2 = stripAnsi(lines[2]);

  assert.match(
    plain0,
    /^✦ Gemini 5h .*88%.* ↻2h 周 .*91%.* ↻2d │ ◈ Claude\/GPT 5h .*65%.* ↻1h 周 .*72%.* ↻3d\s*│ .{27}$/
  );
  assert.match(plain1, /^\s+│ .{27}$/);
  assert.ok(lines[2].includes('48;2;201;138;30'), '72% context should be yellow TrueColor');
  assert.match(
    plain2,
    /^◕ 上下文 .*72%.* 369k\/512k │ ❖ 子代理  1  · ▸ 后台任务  2  │ ✦ Gemini 4 Argon · High\s*│ .{27}$/
  );

  // Column dividers must align across all 3 rows
  assert.equal(displayWidth(lines[0]), displayWidth(lines[1]));
  assert.equal(displayWidth(lines[1]), displayWidth(lines[2]));
  assert.ok(displayWidth(lines[0]) <= 140);
  // Pixel Google uses half-blocks and official brand RGBs with zero extra background on the right column
  assert.match(plain0 + plain1 + plain2, /[▀▄█]/);
  const pixelRightCols = lines.map((line) => line.split('│ ').pop() ?? '');
  const joinedRight = pixelRightCols.join('\n');
  assert.ok(joinedRight.includes('38;2;66;133;244'));
  assert.ok(joinedRight.includes('38;2;234;67;53'));
  assert.ok(joinedRight.includes('38;2;251;188;5'));
  assert.ok(joinedRight.includes('38;2;52;168;83'));
  assert.ok(!joinedRight.includes('\x1b[48;'), 'pixel Google panel must keep transparent background');
});

test('renderHud supports AGY_HUD_BRAND=mini, AGY_HUD_BRAND=off, AGY_HUD_LINE_GAP=0, AGY_HUD_SHOW_MODEL=0, and null model', () => {
  const mini = renderHud(SAMPLE_PAYLOAD, {
    nowMs: 0,
    env: { AGY_HUD_BRAND: 'mini' },
  });
  const miniLines = mini.split('\n');
  assert.equal(miniLines.length, 3);
  assert.equal(miniLines[1], ' ');
  assert.match(stripAnsi(miniLines[2]), /✦ Gemini 4 Argon · High │ Google$/);

  const compactOpt = renderHud(SAMPLE_PAYLOAD, { nowMs: 0, lineGap: 0 });
  assert.equal(compactOpt.split('\n').length, 2);
  assert.match(stripAnsi(compactOpt.split('\n')[1]), /│ Google$/);

  const hiddenModel = renderHud(SAMPLE_PAYLOAD, {
    nowMs: 0,
    env: { AGY_HUD_SHOW_MODEL: '0', AGY_HUD_BRAND: 'mini', AGY_HUD_LINE_GAP: '0' },
  });
  const hiddenPlain = stripAnsi(hiddenModel);
  assert.ok(!hiddenPlain.includes('Gemini 4 Argon'));
  assert.match(hiddenPlain.split('\n')[1], /▸ 后台任务  2  │ Google$/);

  const noModelPixel = renderHud(
    { ...SAMPLE_PAYLOAD, model: null },
    { nowMs: 0 }
  );
  assert.equal(noModelPixel.split('\n').length, 3);
  assert.ok(!stripAnsi(noModelPixel).includes('│ │'), 'must not leave empty dividers when model is null');
});

test('renderHud gracefully cascades down at medium (100 cols) and narrow (48 cols) widths', () => {
  const medWithModel = renderHud(
    { ...SAMPLE_PAYLOAD, terminal_width: 100 },
    { nowMs: 0 }
  );
  const medLines = medWithModel.split('\n');
  assert.equal(medLines.length, 3);
  const medBottom = stripAnsi(medLines[2]);
  assert.ok(medBottom.includes('✦ Gemini 4 Argon · High'), 'should keep model at 100 cols');
  for (const line of medLines) {
    assert.ok(displayWidth(line) <= 100, `line exceeded 100 cols: ${stripAnsi(line)}`);
  }

  const narrow = renderHud(
    { ...SAMPLE_PAYLOAD, terminal_width: 48 },
    { env: {}, nowMs: 0 }
  );
  for (const line of narrow.split('\n')) {
    assert.ok(displayWidth(line) <= 48, `line exceeded 48 cols: ${stripAnsi(line)}`);
    assert.ok(!stripAnsi(line).includes('Google'), 'narrow mode should omit brand wordmark');
  }

  const off = renderHud(SAMPLE_PAYLOAD, {
    env: { AGY_HUD_BRAND: 'off' },
  });
  const offLines = off.split('\n');
  assert.equal(offLines.length, 3);
  assert.equal(offLines[1], ' ');
  assert.match(stripAnsi(offLines[2]), /▸ 后台任务  2  │ ✦ Gemini 4 Argon · High$/);

  const noColorOut = renderHud(SAMPLE_PAYLOAD, { noColor: true });
  assert.equal(noColorOut.split('\n').length, 3);
  assert.ok(stripAnsi(noColorOut).includes('Google'));
  assert.ok(!noColorOut.includes('\x1b['), 'NO_COLOR must strip all ANSI escapes');
});

test('renderHud scales the context bar to the effective compaction ceiling', () => {
  const plainOf = (options) => stripAnsi(renderHud(SAMPLE_PAYLOAD, { nowMs: 0, ...options }));

  const cli = plainOf({ env: { AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K' } });
  assert.ok(cli.includes('369k/800k'), cli);
  assert.ok(cli.includes('46.1%'), cli);

  const hud = renderHud(SAMPLE_PAYLOAD, { nowMs: 0, env: { AGY_HUD_COMPACT_LIMIT: '256k' } });
  assert.ok(stripAnsi(hud).includes('369k/256k'));
  assert.ok(hud.includes('48;2;199;68;84'), '100% of a 256k ceiling should be red');

  const raw = plainOf({ env: { AGY_HUD_COMPACT_LIMIT: 'off' } });
  assert.ok(raw.includes('369k/1M'), raw);
  assert.ok(raw.includes('36.9%'), raw);

  const viaOption = plainOf({ env: {}, compactLimit: '400k' });
  assert.ok(viaOption.includes('369k/400k'), viaOption);
});

test('statusline.mjs CLI handles valid JSON, empty stdin, invalid JSON, and --demo', () => {
  const payload = JSON.stringify({
    model: { display_name: 'Gemini 4 Neon (High)', effort: 'high' },
    quota: { 'gemini-5h': { remaining_fraction: 0.8, reset_in_seconds: 3600 } },
    context_window: { context_window_size: 100000, used_percentage: 95 },
    task_count: 1,
  });

  const outValid = execFileSync(process.execPath, [SCRIPT_PATH], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '', AGY_HUD_QUOTA_SYNC: '0' },
  });
  assert.equal(outValid.trimEnd().split('\n').length, 3);
  assert.ok(outValid.includes('48;2;199;68;84'), 'piped stdout must keep TrueColor ANSI');
  assert.ok(stripAnsi(outValid).includes('✦ Gemini 4 Neon · High'));
  assert.match(stripAnsi(outValid), /[▀▄█]/);

  const outMini = execFileSync(process.execPath, [SCRIPT_PATH], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '', AGY_HUD_BRAND: 'mini', AGY_HUD_QUOTA_SYNC: '0' },
  });
  assert.ok(stripAnsi(outMini).includes('│ Google'));

  const outEmpty = execFileSync(process.execPath, [SCRIPT_PATH], {
    input: '',
    encoding: 'utf8',
  });
  assert.equal(outEmpty.trimEnd().split('\n').length, 3);
  const emptyPlain = stripAnsi(outEmpty);
  assert.ok(emptyPlain.includes('◇ 额度 暂无数据'));
  assert.ok(emptyPlain.includes('○ 上下文'));

  const outInvalid = execFileSync(process.execPath, [SCRIPT_PATH], {
    input: '{bad-json',
    encoding: 'utf8',
  });
  assert.equal(outInvalid.trimEnd().split('\n').length, 3);

  const outOverride = execFileSync(process.execPath, [SCRIPT_PATH], {
    input: JSON.stringify({
      context_window: { context_window_size: 1000000, used_percentage: 40 },
    }),
    encoding: 'utf8',
    env: { ...process.env, AGY_CLI_AUTO_COMPACT_OVERRIDE: '800K', AGY_HUD_QUOTA_SYNC: '0' },
  });
  assert.ok(stripAnsi(outOverride).includes('400k/800k'));

  const outDemo = execFileSync(process.execPath, [SCRIPT_PATH, '--demo'], {
    encoding: 'utf8',
  });
  const plainDemo = stripAnsi(outDemo);
  assert.ok(plainDemo.includes('Agy HUD Demo'));
  assert.ok(plainDemo.includes('Pixel Google'));
  assert.ok(plainDemo.includes('Gemini 4 Neon · High'));
  assert.ok(plainDemo.includes('Claude Opus 4.6 · Max'));
  assert.ok(plainDemo.includes('Normal (<70%)'));
  assert.ok(plainDemo.includes('Warning (>=70%)'));
  assert.ok(plainDemo.includes('Critical (>=90%)'));
});
