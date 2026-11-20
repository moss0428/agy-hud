import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyStatusLineSettings,
  buildStatusLineCommand,
} from '../scripts/install.mjs';

const INSTALL_SCRIPT = fileURLToPath(
  new URL('../scripts/install.mjs', import.meta.url)
);

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('buildStatusLineCommand generates quoted commands per platform', () => {
  const unixCmd = buildStatusLineCommand({
    execPath: '/usr/local/bin/node',
    scriptPath: "/Users/test/my'plugin/statusline.mjs",
    platform: 'darwin',
  });
  assert.equal(
    unixCmd,
    "'/usr/local/bin/node' '/Users/test/my'\\''plugin/statusline.mjs'"
  );

  const winCmd = buildStatusLineCommand({
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    scriptPath: 'C:\\plugins\\statusline.mjs',
    platform: 'win32',
  });
  assert.equal(
    winCmd,
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\plugins\\statusline.mjs"'
  );
});

test('applyStatusLineSettings creates, preserves keys, switches modes, and uninstalls', () => {
  withTempDir((dir) => {
    const settingsPath = path.join(dir, 'nested', 'settings.json');

    // Create new file with stack mode
    applyStatusLineSettings({
      settingsPath,
      command: "'/usr/bin/node' '/tmp/statusline.mjs'",
      stackWithDefault: true,
    });
    let saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(saved.statusLine.stack_with_default, true);
    assert.equal(saved.statusLine.enabled, true);

    // Add unrelated keys and switch to replace mode
    saved.colorScheme = 'tokyo night';
    saved.notifications = true;
    fs.writeFileSync(settingsPath, JSON.stringify(saved, null, 2));

    applyStatusLineSettings({
      settingsPath,
      command: "'/usr/bin/node' '/tmp/statusline.mjs'",
      stackWithDefault: false,
    });
    saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(saved.colorScheme, 'tokyo night');
    assert.equal(saved.notifications, true);
    assert.equal(saved.statusLine.stack_with_default, false);

    // Dry run does not modify file
    const dryResult = applyStatusLineSettings({
      settingsPath,
      uninstall: true,
      dryRun: true,
    });
    assert.equal(dryResult.written, false);
    assert.equal('statusLine' in dryResult.settings, false);
    assert.ok('statusLine' in JSON.parse(fs.readFileSync(settingsPath, 'utf8')));

    // Uninstall removes statusLine while keeping other keys
    applyStatusLineSettings({ settingsPath, uninstall: true });
    saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal('statusLine' in saved, false);
    assert.equal(saved.colorScheme, 'tokyo night');
  });
});

test('applyStatusLineSettings refuses to overwrite malformed settings JSON', () => {
  withTempDir((dir) => {
    const settingsPath = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsPath, '{ broken json', 'utf8');

    assert.throws(
      () => applyStatusLineSettings({ settingsPath }),
      /malformed JSON/
    );
    assert.equal(fs.readFileSync(settingsPath, 'utf8'), '{ broken json');
  });
});

test('install.mjs CLI works end-to-end against temp --settings path', () => {
  withTempDir((dir) => {
    const settingsPath = path.join(dir, 'settings.json');
    const out = execFileSync(
      process.execPath,
      [INSTALL_SCRIPT, '--replace', '--settings', settingsPath],
      { encoding: 'utf8' }
    );
    assert.match(out, /Configured Agy HUD \(replace\)/);
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(saved.statusLine.stack_with_default, false);
    assert.ok(saved.statusLine.command.includes('statusline.mjs'));
  });
});
