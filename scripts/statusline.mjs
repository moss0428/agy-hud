#!/usr/bin/env node
import { renderHud } from './lib/render.mjs';
import { syncQuotaPayload } from './lib/quotaSync.mjs';

const DEMO_PAYLOAD = {
  terminal_width: 128,
  model: {
    id: 'Gemini 4 Neon (High)',
    display_name: 'Gemini 4 Neon (High)',
    effort: 'high',
  },
  quota: {
    'gemini-5h': {
      remaining_fraction: 0.96,
      reset_in_seconds: 3 * 3600 + 45 * 60,
    },
    'gemini-weekly': {
      remaining_fraction: 0.81,
      reset_in_seconds: 5 * 86400 + 8 * 3600,
    },
    '3p-5h': {
      remaining_fraction: 1.0,
      reset_in_seconds: 4 * 3600 + 57 * 60,
    },
    '3p-weekly': {
      remaining_fraction: 1.0,
      reset_in_seconds: 6 * 86400 + 23 * 3600,
    },
  },
  context_window: {
    context_window_size: 1048576,
    used_percentage: 17.9,
  },
  subagents: [],
  task_count: 0,
};

function printHelp() {
  process.stdout.write(
    [
      'Agy HUD - Two-line status line renderer for Antigravity CLI',
      '',
      'Usage:',
      '  node scripts/statusline.mjs          Read session JSON from stdin and render HUD',
      '  node scripts/statusline.mjs --demo   Preview sample HUD output, context thresholds, and pixel Google logo',
      '  node scripts/statusline.mjs --help   Show this help message',
      '',
      'Environment Variables:',
      '  NO_COLOR=1                    Disable ANSI colors and render ASCII bars',
      '  AGY_HUD_SHOW_TOKENS=0         Hide token counts on Line 2',
      '  AGY_HUD_SHOW_MODEL=0          Hide active model and reasoning effort on Line 2',
      '  AGY_HUD_BAR_WIDTH_QUOTA=8     Width of each quota bar (default: 8)',
      '  AGY_HUD_BAR_WIDTH_CONTEXT=16  Width of the context bar (default: 16)',
      '  AGY_HUD_BRAND=pixel           Right-side Google wordmark: pixel (3-row), mini (1-row), or off (default: pixel)',
      '  AGY_HUD_QUOTA_SYNC=0          Disable automatic cross-session quota sync',
      '  AGY_HUD_LINE_GAP=1            Blank spacer lines between row 1 and row 2 (default: 1)',
    ].join('\n') + '\n'
  );
}

function printDemo() {
  process.stdout.write('=== Agy HUD Demo (Compact HUD + Model/Effort + Pixel Google) ===\n');
  process.stdout.write(`${renderHud(DEMO_PAYLOAD)}\n\n`);

  const samples = [
    {
      label: 'Normal (<70%) + Active Workers',
      pct: 42,
      model: { id: 'Gemini 4 Argon (Medium)', display_name: 'Gemini 4 Argon (Medium)', effort: 'medium' },
      subagents: [{ name: 'scout', role: 'research', status: 'running' }],
      task_count: 1,
    },
    {
      label: 'Warning (>=70%) + Active Workers',
      pct: 75,
      model: { id: 'Claude Opus 4.6', display_name: 'Claude Opus 4.6', effort: 'max' },
      subagents: [
        { name: 'scout', status: 'running' },
        { name: 'reviewer', status: 'working' },
      ],
      task_count: 1,
    },
    {
      label: 'Critical (>=90%) + Low Quota',
      pct: 94,
      lowQuota: true,
      model: { id: 'Gemini 4 Flash (Low)', display_name: 'Gemini 4 Flash (Low)', effort: 'low' },
      subagents: [{ name: 'worker', status: 'running' }],
      task_count: 2,
    },
  ];

  process.stdout.write('=== Context Thresholds & Models ===\n');
  for (const sample of samples) {
    const samplePayload = {
      terminal_width: 128,
      model: sample.model,
      quota: sample.lowQuota
        ? {
            'gemini-5h': { remaining_fraction: 0.24, reset_in_seconds: 5400 },
            'gemini-weekly': { remaining_fraction: 0.08, reset_in_seconds: 277200 },
            '3p-5h': { remaining_fraction: 0.65, reset_in_seconds: 3600 },
            '3p-weekly': { remaining_fraction: 0.82, reset_in_seconds: 345600 },
          }
        : {
            'gemini-5h': { remaining_fraction: 0.85, reset_in_seconds: 8100 },
            'gemini-weekly': { remaining_fraction: 0.92, reset_in_seconds: 388800 },
            '3p-5h': { remaining_fraction: 0.78, reset_in_seconds: 6000 },
            '3p-weekly': { remaining_fraction: 0.88, reset_in_seconds: 277200 },
          },
      context_window: {
        context_window_size: 1048576,
        used_percentage: sample.pct,
      },
      subagents: sample.subagents,
      task_count: sample.task_count,
    };
    process.stdout.write(`-- ${sample.label} --\n`);
    process.stdout.write(`${renderHud(samplePayload)}\n\n`);
  }
}

async function readStdinText() {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  if (args.includes('--demo')) {
    printDemo();
    return;
  }

  let payload = {};
  try {
    const raw = (await readStdinText()).trim();
    if (raw.length > 0) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed;
      }
    }
  } catch {
    payload = {};
  }

  payload = syncQuotaPayload(payload);
  process.stdout.write(`${renderHud(payload)}\n`);
}

main().catch(() => {
  process.stdout.write(`${renderHud({})}\n`);
});
