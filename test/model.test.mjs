import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../scripts/lib/ansi.mjs';
import {
  formatEffortLabel,
  parseModelInfo,
  renderModelSegment,
} from '../scripts/lib/model.mjs';

test('parseModelInfo extracts name and effort without duplicating parenthesized effort', () => {
  assert.deepEqual(parseModelInfo({}), { name: '', effort: '' });
  assert.deepEqual(parseModelInfo({ model: null }), { name: '', effort: '' });

  assert.deepEqual(
    parseModelInfo({
      model: {
        id: 'Gemini 4 Argon (Medium)',
        display_name: 'Gemini 4 Argon (Medium)',
        effort: 'medium',
      },
    }),
    { name: 'Gemini 4 Argon', effort: 'medium' }
  );

  // Recovers effort from display_name if effort field is omitted
  assert.deepEqual(
    parseModelInfo({
      model: { display_name: 'Gemini 4 Neon (XHigh)' },
    }),
    { name: 'Gemini 4 Neon', effort: 'xhigh' }
  );

  // Preserves non-effort parenthesized suffixes
  assert.deepEqual(
    parseModelInfo({
      model: { display_name: 'Orchestrator (Neon)', effort: 'high' },
    }),
    { name: 'Orchestrator (Neon)', effort: 'high' }
  );

  // Falls back to id or string model
  assert.deepEqual(
    parseModelInfo({ model: { id: 'claude-sonnet-4-6' } }),
    { name: 'claude-sonnet-4-6', effort: '' }
  );
  assert.deepEqual(
    parseModelInfo({ model: 'GPT-5 (High)' }),
    { name: 'GPT-5', effort: 'high' }
  );
});

test('formatEffortLabel formats known effort levels cleanly', () => {
  assert.equal(formatEffortLabel('low'), 'Low');
  assert.equal(formatEffortLabel('med'), 'Medium');
  assert.equal(formatEffortLabel('high'), 'High');
  assert.equal(formatEffortLabel('xhigh'), 'XHigh');
  assert.equal(formatEffortLabel('max'), 'Max');
  assert.equal(formatEffortLabel(''), '');
});

test('renderModelSegment styles family icons and effort levels without background ANSI', () => {
  assert.equal(renderModelSegment({}), null);

  const gemini = renderModelSegment({
    model: { display_name: 'Gemini 4 Argon (Medium)', effort: 'medium' },
  });
  assert.equal(stripAnsi(gemini), '✦ Gemini 4 Argon · Medium');
  assert.ok(gemini.includes('38;2;125;207;255'), 'Gemini should use sky-blue icon');
  assert.ok(gemini.includes('38;2;115;218;202'), 'Medium effort should use mint color');
  assert.ok(!gemini.includes('\x1b[48;'), 'must not emit background colors');

  const claude = renderModelSegment({
    model: { display_name: 'Claude Opus 4.6', effort: 'max' },
  });
  assert.equal(stripAnsi(claude), '◈ Claude Opus 4.6 · Max');
  assert.ok(claude.includes('38;2;255;158;100'), 'Claude should use peach icon');
  assert.ok(claude.includes('38;2;247;118;142'), 'Max effort should use coral highlight');

  const gpt = renderModelSegment({
    model: { display_name: 'GPT-5', effort: 'low' },
  });
  assert.equal(stripAnsi(gpt), '◈ GPT-5 · Low');
  assert.ok(gpt.includes('38;2;148;163;184'), 'Low effort should use muted slate');

  const noEffort = renderModelSegment(
    { model: { display_name: 'Gemini 4 Flash' } },
    { noColor: true }
  );
  assert.equal(noEffort, '✦ Gemini 4 Flash');
});
