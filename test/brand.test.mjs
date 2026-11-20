import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BG, displayWidth, stripAnsi } from '../scripts/lib/ansi.mjs';
import {
  BRAND_PIXEL_ROWS,
  BRAND_PIXEL_WIDTH,
  GOOGLE_PALETTE,
  GOOGLE_PIXEL_GRID,
  renderGoogleMiniLogo,
  renderGooglePixelLogo,
  renderTransparentPixelGrid,
} from '../scripts/lib/brand.mjs';

test('GOOGLE_PIXEL_GRID matches exact 6x27 dimensions and letter spacing', () => {
  assert.equal(GOOGLE_PIXEL_GRID.length, BRAND_PIXEL_ROWS * 2);
  for (const row of GOOGLE_PIXEL_GRID) {
    assert.equal(row.length, BRAND_PIXEL_WIDTH);
    assert.match(row, /^[.BRYG]+$/);
    // Clean 1-column transparent gaps between G, o, o, g, l, e
    for (const gapCol of [5, 10, 15, 20, 22]) {
      assert.equal(row[gapCol], '.', `expected transparent gap at col ${gapCol}`);
    }
  }
});

test('renderGooglePixelLogo renders 3 transparent TrueColor rows with Google brand palette', () => {
  const logo = renderGooglePixelLogo();
  assert.ok(logo);
  assert.equal(logo.width, BRAND_PIXEL_WIDTH);
  assert.equal(logo.rows.length, BRAND_PIXEL_ROWS);

  const combined = logo.rows.join('\n');
  for (const rgb of Object.values(GOOGLE_PALETTE)) {
    assert.ok(
      combined.includes(`38;2;${rgb[0]};${rgb[1]};${rgb[2]}`),
      `missing TrueColor foreground for rgb(${rgb.join(',')})`
    );
  }

  for (const row of logo.rows) {
    assert.equal(displayWidth(row), BRAND_PIXEL_WIDTH);
    assert.ok(!row.includes('\x1b[48;'), 'pixel Google logo must stay 100% transparent');
    assert.match(stripAnsi(row), /[▀▄█]/);
  }

  assert.equal(renderGooglePixelLogo({ noColor: true }), null);
});

test('renderTransparentPixelGrid resets background via DEFAULT_BG after vertically mixed pixels', () => {
  const stage = renderTransparentPixelGrid(['B.', 'R.'], GOOGLE_PALETTE);
  assert.equal(stage.width, 2);
  assert.equal(stage.rows.length, 1);
  assert.equal(displayWidth(stage.rows[0]), 2);
  assert.ok(stage.rows[0].includes('38;2;66;133;244'));
  assert.ok(stage.rows[0].includes('48;2;234;67;53'));
  assert.ok(stage.rows[0].includes(DEFAULT_BG), 'must emit DEFAULT_BG before transparent cell');
});

test('renderGoogleMiniLogo renders compact colored Google wordmark and NO_COLOR fallback', () => {
  const mini = renderGoogleMiniLogo();
  assert.equal(mini.width, 6);
  assert.equal(stripAnsi(mini.text), 'Google');
  assert.ok(!mini.text.includes('\x1b[48;'));
  for (const rgb of Object.values(GOOGLE_PALETTE)) {
    assert.ok(mini.text.includes(`38;2;${rgb[0]};${rgb[1]};${rgb[2]}`));
  }

  const plain = renderGoogleMiniLogo({ noColor: true });
  assert.deepEqual(plain, { text: 'Google', width: 6 });
});
