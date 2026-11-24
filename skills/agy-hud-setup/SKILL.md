---
name: agy-hud-setup
description: >-
  Preview, configure, switch modes (stacked vs replace), or remove the Agy HUD
  two-line Antigravity CLI status line. Use when the user asks to set up,
  customize, preview, or troubleshoot the Agy HUD status bar.
---

# Agy HUD Setup & Troubleshooting

This plugin provides a zero-dependency Node.js status line script (`scripts/statusline.mjs`) and a safe configuration installer (`scripts/install.mjs`) at the plugin root (`~/.gemini/config/plugins/agy-hud` when installed globally).

## 1. Preview the 2-Line HUD

Run the demo mode to preview TrueColor sub-cell progress bars, `Gemini` and `Claude/GPT` quotas, context threshold colors (`<70%` green, `>=70%` yellow, `>=90%` red), combined subagent/task counters, active model & reasoning effort, and the transparent pixel-art `Google` wordmark:

```bash
node ~/.gemini/config/plugins/agy-hud/scripts/statusline.mjs --demo
```

## 2. Activate in Antigravity CLI

### Option A: One-command installer (recommended)

Writes the `statusLine` block to `~/.gemini/antigravity-cli/settings.json` while keeping all other settings intact:

```bash
# Stack below the built-in status line (default)
node ~/.gemini/config/plugins/agy-hud/scripts/install.mjs

# Or replace the built-in status line completely
node ~/.gemini/config/plugins/agy-hud/scripts/install.mjs --replace
```

Preview the resulting JSON without modifying disk using `--dry-run`.

### Option B: Inside an active CLI session via `/statusline`

```text
/statusline node ~/.gemini/config/plugins/agy-hud/scripts/statusline.mjs
```

## 3. Customization Environment Variables

Wrap the `statusLine.command` or export in your shell profile to tune the HUD:

- `NO_COLOR=1`: Disable ANSI colors and render plain ASCII bars (`[####.... 85%]`).
- `AGY_HUD_SHOW_TOKENS=0`: Hide the compact `used/total` token summary on Line 2.
- `AGY_HUD_SHOW_MODEL=0`: Hide the active model name and reasoning effort indicator on Line 2.
- `AGY_HUD_COMPACT_LIMIT=512k`: Auto-compaction ceiling used as 100% of the context bar (token count, `800K`/`0.5M`, `80%`, or `off` for the raw model window). Falls back to `AGY_CLI_AUTO_COMPACT_OVERRIDE`, then to `512k` for models whose window exceeds it.
- `AGY_HUD_BAR_WIDTH_QUOTA=8`: Set quota progress bar cell width (minimum 6 on narrow terminals).
- `AGY_HUD_BAR_WIDTH_CONTEXT=16`: Set context progress bar cell width.
- `AGY_HUD_BRAND=pixel`: Control the right-side Google wordmark (`pixel` for 3-row transparent pixel-art `Google`, `mini` for compact 1-row colored `Google`, or `off`).
- `AGY_HUD_QUOTA_SYNC=0`: Disable automatic cross-session quota synchronization across concurrent CLI windows.
- `AGY_HUD_LINE_GAP=1`: Blank spacer lines inserted between the quota row and context row (`0`–`3`, default `1`).

## 4. Disable or Remove

Inside `agy`, run `/statusline delete`, or from your shell run:

```bash
node ~/.gemini/config/plugins/agy-hud/scripts/install.mjs --uninstall
```
