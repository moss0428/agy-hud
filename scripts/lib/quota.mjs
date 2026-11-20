import { BOLD, displayWidth, fgRgb, style, truncateToWidth } from './ansi.mjs';
import { clampPercent, renderProgressBar } from './bar.mjs';

const WINDOW_SUFFIX_RE = /[-_](5h|5hr|5hour|daily|24h|1d|weekly|7d|week)$/i;

const POOL_METADATA = {
  gemini: {
    poolId: 'gemini',
    poolLabel: 'Gemini',
    poolIcon: '✦',
    poolColor: [125, 207, 255],
    priority: 10,
  },
  '3p': {
    poolId: '3p',
    poolLabel: 'Claude/GPT',
    poolIcon: '◈',
    poolColor: [187, 154, 247],
    priority: 20,
  },
  'third-party': {
    poolId: '3p',
    poolLabel: 'Claude/GPT',
    poolIcon: '◈',
    poolColor: [187, 154, 247],
    priority: 20,
  },
  third_party: {
    poolId: '3p',
    poolLabel: 'Claude/GPT',
    poolIcon: '◈',
    poolColor: [187, 154, 247],
    priority: 20,
  },
  claude: {
    poolId: 'claude',
    poolLabel: 'Claude',
    poolIcon: '◈',
    poolColor: [255, 158, 100],
    priority: 21,
  },
  gpt: {
    poolId: 'gpt',
    poolLabel: 'GPT',
    poolIcon: '◈',
    poolColor: [115, 218, 202],
    priority: 22,
  },
  openai: {
    poolId: 'gpt',
    poolLabel: 'GPT',
    poolIcon: '◈',
    poolColor: [115, 218, 202],
    priority: 22,
  },
  'gemini-argon': {
    poolId: 'argon',
    poolLabel: 'Argon',
    poolIcon: '◆',
    poolColor: [247, 118, 142],
    priority: 30,
  },
  argon: {
    poolId: 'argon',
    poolLabel: 'Argon',
    poolIcon: '◆',
    poolColor: [247, 118, 142],
    priority: 30,
  },
};

/**
 * Format a remaining countdown in seconds into a compact display string.
 */
export function formatCountdown(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return '';
  }
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) {
    return '0m';
  }
  if (s < 60) {
    return '<1m';
  }
  if (s < 3600) {
    return `${Math.ceil(s / 60)}m`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h${m > 0 ? `${m}m` : ''}`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d${h > 0 ? `${h}h` : ''}`;
}

/**
 * Classify a raw quota bucket key into a normalized pool and window descriptor.
 */
export function classifyQuotaKey(rawKey) {
  const key = String(rawKey || '').trim();
  const match = key.match(WINDOW_SUFFIX_RE);

  let windowType = 'other';
  let windowLabel = '';
  let windowOrder = 4;
  let rawPool = key;

  if (match) {
    const suffix = match[1].toLowerCase();
    rawPool = key.slice(0, match.index);
    if (suffix === '5h' || suffix === '5hr' || suffix === '5hour') {
      windowType = '5h';
      windowLabel = '5h';
      windowOrder = 1;
    } else if (suffix === 'daily' || suffix === '24h' || suffix === '1d') {
      windowType = 'daily';
      windowLabel = '日';
      windowOrder = 2;
    } else {
      windowType = 'weekly';
      windowLabel = '周';
      windowOrder = 3;
    }
  }

  const normalizedPool = rawPool.toLowerCase().replace(/[-_]wtu$/i, '');
  const known = POOL_METADATA[normalizedPool];
  if (known) {
    return {
      ...known,
      windowType,
      windowLabel,
      windowOrder,
    };
  }

  const titleLabel = normalizedPool
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    poolId: normalizedPool || 'quota',
    poolLabel: titleLabel || 'Quota',
    poolIcon: '◇',
    poolColor: [122, 162, 247],
    priority: 50,
    windowType,
    windowLabel,
    windowOrder,
  };
}

/**
 * Parse and group quota entries into sorted pool structures.
 */
export function parseQuotaPools(quotaObj, { nowMs = Date.now() } = {}) {
  if (!quotaObj || typeof quotaObj !== 'object' || Array.isArray(quotaObj)) {
    return [];
  }

  const poolsById = new Map();

  for (const [rawKey, entry] of Object.entries(quotaObj)) {
    if (!entry || typeof entry !== 'object' || entry.disabled === true) {
      continue;
    }

    const hasFraction =
      typeof entry.remaining_fraction === 'number' &&
      Number.isFinite(entry.remaining_fraction);
    const hasAmount =
      typeof entry.remaining_amount === 'number' &&
      Number.isFinite(entry.remaining_amount);

    if (!hasFraction && !hasAmount) {
      continue;
    }

    const remainingPct = hasFraction
      ? clampPercent(entry.remaining_fraction * 100)
      : null;
    const remainingAmount = hasAmount ? entry.remaining_amount : null;

    let resetSeconds = null;
    if (
      typeof entry.reset_in_seconds === 'number' &&
      Number.isFinite(entry.reset_in_seconds)
    ) {
      resetSeconds = Math.max(0, Math.floor(entry.reset_in_seconds));
    } else if (typeof entry.reset_time === 'string' && entry.reset_time) {
      const parsedMs = Date.parse(entry.reset_time);
      if (Number.isFinite(parsedMs)) {
        resetSeconds = Math.max(0, Math.floor((parsedMs - nowMs) / 1000));
      }
    }

    const meta = classifyQuotaKey(rawKey);
    if (!poolsById.has(meta.poolId)) {
      poolsById.set(meta.poolId, {
        poolId: meta.poolId,
        poolLabel: meta.poolLabel,
        poolIcon: meta.poolIcon,
        poolColor: meta.poolColor,
        priority: meta.priority,
        windows: [],
      });
    }

    poolsById.get(meta.poolId).windows.push({
      rawKey,
      windowType: meta.windowType,
      windowLabel: meta.windowLabel,
      windowOrder: meta.windowOrder,
      remainingPct,
      remainingAmount,
      resetSeconds,
    });
  }

  const pools = Array.from(poolsById.values());
  pools.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.poolLabel.localeCompare(b.poolLabel);
  });

  for (const pool of pools) {
    pool.windows.sort((a, b) => {
      if (a.windowOrder !== b.windowOrder) {
        return a.windowOrder - b.windowOrder;
      }
      return a.rawKey.localeCompare(b.rawKey);
    });
  }

  return pools;
}

/**
 * Determine color tone for remaining quota percentage.
 */
export function quotaTone(remainingPct) {
  const pct = clampPercent(remainingPct);
  if (pct < 10) {
    return 'red';
  }
  if (pct < 30) {
    return 'yellow';
  }
  return 'green';
}

function renderPoolSegment(pool, { barWidth, noColor }) {
  const [r, g, b] = pool.poolColor;
  const poolTitle = style(
    `${pool.poolIcon} ${pool.poolLabel}`,
    [BOLD, fgRgb(r, g, b)],
    noColor
  );

  const windowParts = pool.windows.map((win) => {
    const labelPart = win.windowLabel
      ? `${style(win.windowLabel, fgRgb(169, 177, 214), noColor)} `
      : '';
    const countdown = formatCountdown(win.resetSeconds);
    const countdownPart = countdown
      ? ` ${style(`↻${countdown}`, fgRgb(126, 137, 168), noColor)}`
      : '';

    if (win.remainingPct !== null) {
      const bar = renderProgressBar(win.remainingPct, {
        width: barWidth,
        tone: quotaTone(win.remainingPct),
        label: `${Math.round(win.remainingPct)}%`,
        noColor,
      });
      return `${labelPart}${bar}${countdownPart}`;
    }

    const amountBadge = style(`[${win.remainingAmount}]`, fgRgb(169, 177, 214), noColor);
    return `${labelPart}${amountBadge}${countdownPart}`;
  });

  return `${poolTitle} ${windowParts.join(' ')}`;
}

/**
 * Render Line 1 of the HUD: multi-pool 5h/weekly quotas and reset countdowns.
 */
export function renderQuotaLine(
  payload,
  { barWidth = 8, terminalWidth = 0, noColor = false, nowMs = Date.now() } = {}
) {
  const pools = parseQuotaPools(payload?.quota, { nowMs });
  if (pools.length === 0) {
    return style('◇ 额度 暂无数据', fgRgb(120, 130, 164), noColor);
  }

  const sep = style(' │ ', fgRgb(65, 72, 104), noColor);

  const buildSingleLine = (width) =>
    pools.map((pool) => renderPoolSegment(pool, { barWidth: width, noColor })).join(sep);

  let activeWidth = barWidth;
  let rendered = buildSingleLine(activeWidth);

  if (terminalWidth <= 0 || displayWidth(rendered) <= terminalWidth) {
    return rendered;
  }

  if (activeWidth > 6) {
    activeWidth = 6;
    rendered = buildSingleLine(activeWidth);
    if (displayWidth(rendered) <= terminalWidth) {
      return rendered;
    }
  }

  if (pools.length === 1) {
    return truncateToWidth(rendered, terminalWidth, { noColor });
  }

  const segments = pools.map((pool) =>
    renderPoolSegment(pool, { barWidth: activeWidth, noColor })
  );
  const sepWidth = displayWidth(sep);
  const lines = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const seg of segments) {
    const segWidth = displayWidth(seg);
    if (!currentLine) {
      currentLine = seg;
      currentWidth = segWidth;
    } else if (currentWidth + sepWidth + segWidth <= terminalWidth) {
      currentLine += sep + seg;
      currentWidth += sepWidth + segWidth;
    } else {
      lines.push(truncateToWidth(currentLine, terminalWidth, { noColor }));
      currentLine = seg;
      currentWidth = segWidth;
    }
  }
  if (currentLine) {
    lines.push(truncateToWidth(currentLine, terminalWidth, { noColor }));
  }

  return lines.join('\n');
}
