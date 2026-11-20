import test from 'node:test';
import assert from 'node:assert/strict';
import { displayWidth, stripAnsi, truncateToWidth } from '../scripts/lib/ansi.mjs';
import { renderProgressBar } from '../scripts/lib/bar.mjs';

test('renderProgressBar embeds centered percentage and uses TrueColor RGB palette', () => {
  const bar = renderProgressBar(50, { width: 10, tone: 'green' });
  const plain = stripAnsi(bar);
  assert.equal(plain.length, 10);
  assert.match(plain, /^\s+50%\s+$/);
  assert.ok(bar.includes('\x1b[48;2;39;133;99m'), 'filled cells should use green TrueColor bg');
  assert.ok(bar.includes('\x1b[48;2;46;52;71m'), 'empty cells should use track TrueColor bg');
  assert.ok(bar.endsWith('\x1b[0m'));
});

test('renderProgressBar renders sub-cell fractional edge blocks without corrupting digits', () => {
  const bar179 = renderProgressBar(17.9, { width: 16, tone: 'green', label: '17.9%' });
  const plain179 = stripAnsi(bar179);
  assert.equal(plain179.length, 16);
  assert.ok(plain179.includes('17.9%'), 'embedded digits must stay intact');
  assert.match(plain179, /[▏▎▍▌▋▊▉]/, 'non-integer cell boundary should use fractional block');

  const bar96 = renderProgressBar(96, { width: 8, tone: 'green' });
  const plain96 = stripAnsi(bar96);
  assert.equal(plain96.length, 8);
  assert.ok(plain96.includes('96%'), 'embedded digits must stay intact');
  assert.match(plain96, /[▏▎▍▌▋▊▉]/, '96% on width 8 should render partial trailing block');

  const bar43 = renderProgressBar(43, { width: 10, tone: 'green' });
  assert.ok(stripAnsi(bar43).includes('43%'), 'fractional boundary on digit must not overwrite digit');
});

test('renderProgressBar handles 0% and 100% boundaries without bleeding fill', () => {
  const emptyBar = renderProgressBar(0, { width: 8, tone: 'red' });
  assert.equal(stripAnsi(emptyBar).length, 8);
  assert.ok(!emptyBar.includes('48;2;199;68;84'), '0% bar should not render filled bg');
  assert.ok(emptyBar.includes('48;2;46;52;71'), '0% bar should render track bg');

  const fullBar = renderProgressBar(100, { width: 8, tone: 'yellow' });
  assert.equal(stripAnsi(fullBar).length, 8);
  assert.ok(fullBar.includes('48;2;201;138;30'), '100% bar should use yellow TrueColor bg');
  assert.ok(!fullBar.includes('48;2;46;52;71'), '100% bar should not render empty bg');
});

test('renderProgressBar uses red TrueColor bg for red tone and honors NO_COLOR fallback', () => {
  const redBar = renderProgressBar(92, { width: 10, tone: 'red' });
  assert.ok(redBar.includes('48;2;199;68;84'));

  const ascii = renderProgressBar(50, { width: 8, tone: 'green', noColor: true });
  assert.equal(ascii, '[####.... 50%]');
  assert.equal(stripAnsi(ascii), ascii);
});

test('displayWidth handles monochrome geometric icons and CJK truncation', () => {
  for (const icon of ['✦', '◈', '◆', '◇', '❖', '↻', '○', '◔', '◑', '◕', '●', '▹', '▸', '·', '│', '▏', '▉']) {
    assert.equal(displayWidth(icon), 1, `icon ${icon} should be 1 column wide`);
  }

  assert.equal(displayWidth('◔ 上下文 42%'), 12);
  assert.equal(displayWidth('\x1b[1m❖ 子代理 2\x1b[0m'), 10);

  const truncated = truncateToWidth('\x1b[32m上下文测试超长文本\x1b[0m', 7);
  assert.equal(stripAnsi(truncated), '上下文…');
  assert.ok(displayWidth(truncated) <= 7);
  assert.ok(truncated.endsWith('\x1b[0m'));

  const plainTrunc = truncateToWidth('上下文测试', 5, { noColor: true });
  assert.equal(plainTrunc, '上下…');
  assert.ok(!plainTrunc.includes('\x1b['), 'noColor truncation should not add ANSI');
});
