import { BOLD, displayWidth, fgRgb, style, truncateToWidth } from './ansi.mjs';
import { clampPercent, renderProgressBar } from './bar.mjs';

/**
 * Fallback auto-compaction ceiling (tokens) for large-window models when neither
 * the payload nor an environment override states the effective limit.
 */
export const DEFAULT_COMPACT_LIMIT = 512_000;

const DISABLE_COMPACT_LIMIT_RE = /^(0|off|false|none|raw|model)$/i;
const PAYLOAD_LIMIT_KEYS = [
  'max_context_tokens',
  'auto_compact_limit',
  'compaction_threshold',
  'auto_compact_threshold',
];

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Parse a compaction limit such as `700000`, `800K`, `0.5M`, or `80%`.
 * Percentages are relative to `windowSize`. Returns null when unusable.
 */
export function parseCompactLimitValue(rawValue, windowSize = 0) {
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) && rawValue > 0 ? Math.round(rawValue) : null;
  }
  if (typeof rawValue !== 'string') {
    return null;
  }
  const text = rawValue.trim();
  if (!text) {
    return null;
  }

  let match = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (match) {
    const pct = Number(match[1]);
    if (!(pct > 0) || !(windowSize > 0)) {
      return null;
    }
    const tokens = Math.round((pct / 100) * windowSize);
    return tokens > 0 ? tokens : null;
  }

  match = text.match(/^(\d+(?:\.\d+)?)\s*([km])$/i);
  if (match) {
    const mult = match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000;
    const tokens = Math.round(Number(match[1]) * mult);
    return tokens > 0 ? tokens : null;
  }

  match = text.match(/^(\d+(?:\.\d+)?)$/);
  if (match) {
    const tokens = Math.round(Number(match[1]));
    return tokens > 0 ? tokens : null;
  }

  return null;
}

function capToWindow(limit, windowSize) {
  return windowSize > 0 ? Math.min(limit, windowSize) : limit;
}

function resolveEffectiveLimit(
  cw,
  windowSize,
  { env = process.env, compactLimit, defaultCompactLimit = DEFAULT_COMPACT_LIMIT } = {}
) {
  const hudRaw = compactLimit !== undefined ? compactLimit : env?.AGY_HUD_COMPACT_LIMIT;

  if (
    hudRaw === 0 ||
    hudRaw === false ||
    (typeof hudRaw === 'string' && DISABLE_COMPACT_LIMIT_RE.test(hudRaw.trim()))
  ) {
    return { effectiveLimit: windowSize, limitSource: windowSize > 0 ? 'model' : 'none' };
  }

  for (const key of PAYLOAD_LIMIT_KEYS) {
    const val = finiteNumber(cw?.[key]);
    if (val !== null && val > 0) {
      return {
        effectiveLimit: capToWindow(Math.round(val), windowSize),
        limitSource: 'payload',
      };
    }
  }

  const parsedHud = parseCompactLimitValue(hudRaw, windowSize);
  if (parsedHud !== null) {
    return { effectiveLimit: capToWindow(parsedHud, windowSize), limitSource: 'hud_env' };
  }

  const parsedCli = parseCompactLimitValue(env?.AGY_CLI_AUTO_COMPACT_OVERRIDE, windowSize);
  if (parsedCli !== null) {
    return { effectiveLimit: capToWindow(parsedCli, windowSize), limitSource: 'cli_env' };
  }

  if (windowSize <= 0) {
    return { effectiveLimit: 0, limitSource: 'none' };
  }
  if (defaultCompactLimit > 0 && windowSize > defaultCompactLimit) {
    return { effectiveLimit: defaultCompactLimit, limitSource: 'default' };
  }
  return { effectiveLimit: windowSize, limitSource: 'model' };
}

/**
 * Parse context_window telemetry into percentage and token counts, measured
 * against the effective auto-compaction ceiling rather than the raw model window.
 */
export function parseContextWindow(payload, options = {}) {
  const cw = payload?.context_window;
  const windowSize = (() => {
    const size = finiteNumber(cw?.context_window_size);
    return size !== null && size > 0 ? size : 0;
  })();

  let rawUsedPct = 0;
  let usedTokens = 0;

  const directTokens = finiteNumber(cw?.estimated_tokens_used) ?? finiteNumber(cw?.used_tokens);
  const usedPctField = finiteNumber(cw?.used_percentage);
  const remainingPctField = finiteNumber(cw?.remaining_percentage);

  if (directTokens !== null && directTokens >= 0) {
    usedTokens = Math.round(directTokens);
    if (usedPctField !== null) {
      rawUsedPct = clampPercent(usedPctField);
    } else if (remainingPctField !== null) {
      rawUsedPct = clampPercent(100 - remainingPctField);
    } else if (windowSize > 0) {
      rawUsedPct = clampPercent((usedTokens / windowSize) * 100);
    }
  } else if (usedPctField !== null) {
    rawUsedPct = clampPercent(usedPctField);
    usedTokens = windowSize > 0 ? Math.round((rawUsedPct / 100) * windowSize) : 0;
  } else if (remainingPctField !== null) {
    rawUsedPct = clampPercent(100 - remainingPctField);
    usedTokens = windowSize > 0 ? Math.round((rawUsedPct / 100) * windowSize) : 0;
  } else if (
    windowSize > 0 &&
    (finiteNumber(cw?.total_input_tokens) !== null ||
      finiteNumber(cw?.total_output_tokens) !== null)
  ) {
    const input = finiteNumber(cw?.total_input_tokens) ?? 0;
    const output = finiteNumber(cw?.total_output_tokens) ?? 0;
    usedTokens = Math.max(0, Math.round(input + output));
    rawUsedPct = clampPercent((usedTokens / windowSize) * 100);
  }

  const { effectiveLimit, limitSource } = resolveEffectiveLimit(cw, windowSize, options);

  const usedPct =
    effectiveLimit > 0 && effectiveLimit !== windowSize
      ? clampPercent((usedTokens / effectiveLimit) * 100)
      : rawUsedPct;

  return {
    usedPct,
    rawUsedPct,
    windowSize,
    effectiveLimit,
    usedTokens,
    limitSource,
  };
}

/**
 * Map context usage percentage to threshold color tone:
 * >= 90% red, >= 70% yellow, otherwise green.
 */
export function contextTone(usedPct) {
  const pct = clampPercent(usedPct);
  if (pct >= 90) {
    return 'red';
  }
  if (pct >= 70) {
    return 'yellow';
  }
  return 'green';
}

/**
 * Pick a crisp geometric gauge icon corresponding to context utilization.
 */
export function contextIcon(usedPct) {
  const pct = clampPercent(usedPct);
  if (pct <= 0) {
    return '○';
  }
  if (pct < 40) {
    return '◔';
  }
  if (pct < 70) {
    return '◑';
  }
  if (pct < 90) {
    return '◕';
  }
  return '●';
}

/**
 * Format percentage concisely (e.g. 0%, 17.9%, 70%, 100%).
 */
export function formatPercent(pct) {
  const value = clampPercent(pct);
  if (value <= 0) {
    return '0%';
  }
  if (value >= 100) {
    return '100%';
  }
  return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

/**
 * Format token count into compact k / M units.
 */
export function formatTokens(tokens) {
  const n = typeof tokens === 'number' && Number.isFinite(tokens) ? Math.max(0, tokens) : 0;
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return `${Math.round(n)}`;
}

/**
 * Render the context segment (icon, label, progress bar, optional token summary).
 */
export function renderContextSegment(
  payload,
  {
    barWidth = 16,
    showTokens = true,
    noColor = false,
    env = process.env,
    compactLimit,
    defaultCompactLimit,
  } = {}
) {
  const { usedPct, effectiveLimit, usedTokens } = parseContextWindow(payload, {
    env,
    compactLimit,
    defaultCompactLimit,
  });
  const tone = contextTone(usedPct);
  const icon = contextIcon(usedPct);

  const iconCodes =
    tone === 'red'
      ? [BOLD, fgRgb(244, 104, 122)]
      : tone === 'yellow'
        ? [BOLD, fgRgb(242, 185, 75)]
        : fgRgb(79, 209, 165);

  const labelCodes =
    tone === 'red'
      ? [BOLD, fgRgb(244, 104, 122)]
      : tone === 'yellow'
        ? [BOLD, fgRgb(242, 185, 75)]
        : fgRgb(192, 202, 245);

  const iconStyled = style(icon, iconCodes, noColor);
  const labelStyled = style('上下文', labelCodes, noColor);

  const bar = renderProgressBar(usedPct, {
    width: barWidth,
    tone,
    label: formatPercent(usedPct),
    noColor,
  });

  const base = `${iconStyled} ${labelStyled} ${bar}`;
  if (showTokens && effectiveLimit > 0) {
    const tokenSummary = `${formatTokens(usedTokens)}/${formatTokens(effectiveLimit)}`;
    return `${base} ${style(tokenSummary, fgRgb(137, 148, 179), noColor)}`;
  }
  return base;
}

/**
 * Render standalone context line with responsive width adjustment.
 */
export function renderContextLine(
  payload,
  {
    barWidth = 16,
    showTokens = true,
    terminalWidth = 0,
    noColor = false,
    env = process.env,
    compactLimit,
    defaultCompactLimit,
  } = {}
) {
  const effectiveWidth =
    terminalWidth > 0 && terminalWidth < 40 ? Math.min(barWidth, 12) : barWidth;

  const withTokens = renderContextSegment(payload, {
    barWidth: effectiveWidth,
    showTokens,
    noColor,
    env,
    compactLimit,
    defaultCompactLimit,
  });

  if (terminalWidth <= 0 || displayWidth(withTokens) <= terminalWidth) {
    return withTokens;
  }

  const withoutTokens = renderContextSegment(payload, {
    barWidth: effectiveWidth,
    showTokens: false,
    noColor,
    env,
    compactLimit,
    defaultCompactLimit,
  });
  if (displayWidth(withoutTokens) <= terminalWidth) {
    return withoutTokens;
  }
  return truncateToWidth(withoutTokens, terminalWidth, { noColor });
}
