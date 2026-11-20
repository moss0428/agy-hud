import { BOLD, displayWidth, fgRgb, style, truncateToWidth } from './ansi.mjs';
import { clampPercent, renderProgressBar } from './bar.mjs';

/**
 * Parse context_window telemetry into percentage and token counts.
 */
export function parseContextWindow(payload) {
  const cw = payload?.context_window;
  const windowSize =
    typeof cw?.context_window_size === 'number' &&
    Number.isFinite(cw.context_window_size) &&
    cw.context_window_size > 0
      ? cw.context_window_size
      : 0;

  let usedPct = 0;
  if (typeof cw?.used_percentage === 'number' && Number.isFinite(cw.used_percentage)) {
    usedPct = clampPercent(cw.used_percentage);
  } else if (
    typeof cw?.remaining_percentage === 'number' &&
    Number.isFinite(cw.remaining_percentage)
  ) {
    usedPct = clampPercent(100 - cw.remaining_percentage);
  } else if (
    windowSize > 0 &&
    (typeof cw?.total_input_tokens === 'number' ||
      typeof cw?.total_output_tokens === 'number')
  ) {
    const input =
      typeof cw.total_input_tokens === 'number' && Number.isFinite(cw.total_input_tokens)
        ? cw.total_input_tokens
        : 0;
    const output =
      typeof cw.total_output_tokens === 'number' && Number.isFinite(cw.total_output_tokens)
        ? cw.total_output_tokens
        : 0;
    usedPct = clampPercent(((input + output) / windowSize) * 100);
  }

  const usedTokens = windowSize > 0 ? Math.round((usedPct / 100) * windowSize) : 0;

  return {
    usedPct,
    windowSize,
    usedTokens,
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
  { barWidth = 16, showTokens = true, noColor = false } = {}
) {
  const { usedPct, windowSize, usedTokens } = parseContextWindow(payload);
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
  if (showTokens && windowSize > 0) {
    const tokenSummary = `${formatTokens(usedTokens)}/${formatTokens(windowSize)}`;
    return `${base} ${style(tokenSummary, fgRgb(137, 148, 179), noColor)}`;
  }
  return base;
}

/**
 * Render standalone context line with responsive width adjustment.
 */
export function renderContextLine(
  payload,
  { barWidth = 16, showTokens = true, terminalWidth = 0, noColor = false } = {}
) {
  const effectiveWidth =
    terminalWidth > 0 && terminalWidth < 40 ? Math.min(barWidth, 12) : barWidth;

  const withTokens = renderContextSegment(payload, {
    barWidth: effectiveWidth,
    showTokens,
    noColor,
  });

  if (terminalWidth <= 0 || displayWidth(withTokens) <= terminalWidth) {
    return withTokens;
  }

  const withoutTokens = renderContextSegment(payload, {
    barWidth: effectiveWidth,
    showTokens: false,
    noColor,
  });
  if (displayWidth(withoutTokens) <= terminalWidth) {
    return withoutTokens;
  }
  return truncateToWidth(withoutTokens, terminalWidth, { noColor });
}
