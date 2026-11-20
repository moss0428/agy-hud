#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default path to the Antigravity CLI settings file.
 */
export function defaultSettingsPath() {
  return path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
}

/**
 * Build a platform-appropriate shell command string invoking statusline.mjs via Node.
 */
export function buildStatusLineCommand({
  execPath = process.execPath,
  scriptPath = fileURLToPath(new URL('./statusline.mjs', import.meta.url)),
  platform = process.platform,
} = {}) {
  if (platform === 'win32') {
    const escapedNode = execPath.replace(/"/g, '\\"');
    const escapedScript = scriptPath.replace(/"/g, '\\"');
    return `"${escapedNode}" "${escapedScript}"`;
  }
  const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
  return `${shellQuote(execPath)} ${shellQuote(scriptPath)}`;
}

/**
 * Read, update, and atomically write statusLine configuration in settings.json.
 */
export function applyStatusLineSettings({
  settingsPath = defaultSettingsPath(),
  command = buildStatusLineCommand(),
  stackWithDefault = true,
  uninstall = false,
  dryRun = false,
} = {}) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    if (raw.trim().length > 0) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Refusing to overwrite malformed JSON in ${settingsPath}: ${err.message}`
        );
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(
          `Refusing to overwrite non-object JSON settings in ${settingsPath}`
        );
      }
      settings = parsed;
    }
  }

  const nextSettings = { ...settings };
  if (uninstall) {
    delete nextSettings.statusLine;
  } else {
    nextSettings.statusLine = {
      type: 'command',
      command,
      enabled: true,
      padding: 0,
      stack_with_default: Boolean(stackWithDefault),
    };
  }

  if (!dryRun) {
    const dir = path.dirname(settingsPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(
      dir,
      `.settings.json.tmp-${process.pid}-${Date.now()}`
    );
    const content = `${JSON.stringify(nextSettings, null, 2)}\n`;
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(tmpPath, 0o600);
      } catch {
        // Ignore chmod failure on filesystems that do not support POSIX modes
      }
    }
    fs.renameSync(tmpPath, settingsPath);
  }

  return {
    settingsPath,
    settings: nextSettings,
    written: !dryRun,
  };
}

function parseCliArgs(argv) {
  const opts = {
    stackWithDefault: true,
    uninstall: false,
    dryRun: false,
    settingsPath: defaultSettingsPath(),
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--stack') {
      opts.stackWithDefault = true;
    } else if (arg === '--replace') {
      opts.stackWithDefault = false;
    } else if (arg === '--uninstall') {
      opts.uninstall = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--settings') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--settings requires a file path argument');
      }
      opts.settingsPath = next;
      i += 1;
    } else if (arg.startsWith('--settings=')) {
      const value = arg.slice('--settings='.length);
      if (!value) {
        throw new Error('--settings= requires a non-empty file path');
      }
      opts.settingsPath = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/install.mjs [options]',
      '',
      'Options:',
      '  --stack            Keep default status line above Agy HUD (default)',
      '  --replace          Replace the default status line with Agy HUD',
      '  --uninstall        Remove statusLine entry from settings.json',
      '  --dry-run          Print updated settings JSON without writing to disk',
      '  --settings <path>  Target settings.json path (default: ~/.gemini/antigravity-cli/settings.json)',
      '  -h, --help         Show help',
    ].join('\n') + '\n'
  );
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    if (opts.help) {
      printUsage();
      process.exit(0);
    }
    const result = applyStatusLineSettings({
      settingsPath: opts.settingsPath,
      stackWithDefault: opts.stackWithDefault,
      uninstall: opts.uninstall,
      dryRun: opts.dryRun,
    });
    if (opts.dryRun) {
      process.stdout.write(`${JSON.stringify(result.settings, null, 2)}\n`);
    } else if (opts.uninstall) {
      process.stdout.write(`Removed statusLine from ${result.settingsPath}\n`);
    } else {
      const modeLabel = opts.stackWithDefault ? 'stacked' : 'replace';
      process.stdout.write(
        `Configured Agy HUD (${modeLabel}) in ${result.settingsPath}\n`
      );
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}
