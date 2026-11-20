import { displayWidth, fgRgb, isNoColor, style, truncateToWidth } from './ansi.mjs';
import { renderQuotaLine } from './quota.mjs';
import { renderContextSegment } from './context.mjs';
import { renderActivitySegment } from './activity.mjs';
import { renderModelSegment } from './model.mjs';
import { renderGoogleMiniLogo, renderGooglePixelLogo } from './brand.mjs';

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseLineGap(value, fallback = 1) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(3, Math.floor(n)));
}

function padRightWidth(text, targetWidth) {
  const w = displayWidth(text);
  if (w >= targetWidth) {
    return text;
  }
  return `${text}${' '.repeat(targetWidth - w)}`;
}

function buildBottomLine(payload, { barWidth, showTokens, model, brand, noColor }) {
  const sep = style(' │ ', fgRgb(65, 72, 104), noColor);
  const context = renderContextSegment(payload, { barWidth, showTokens, noColor });
  const activity = renderActivitySegment(payload, { noColor });
  const parts = [context, activity];
  if (model) {
    parts.push(model);
  }
  if (brand) {
    parts.push(brand.text);
  }
  return parts.join(sep);
}

function getWidthVariants(barWidth, showTokens) {
  const variants = [{ barWidth, showTokens }];
  if (showTokens) {
    variants.push({ barWidth, showTokens: false });
  }
  if (barWidth > 10) {
    variants.push({ barWidth: 10, showTokens: false });
  }
  if (barWidth > 8) {
    variants.push({ barWidth: 8, showTokens: false });
  }
  return variants;
}

function renderResponsiveBottomLine(
  payload,
  { barWidth, showTokens, model, brand, terminalWidth, noColor }
) {
  if (terminalWidth <= 0) {
    return buildBottomLine(payload, { barWidth, showTokens, model, brand, noColor });
  }

  const variants = getWidthVariants(barWidth, showTokens);

  if (model && brand) {
    for (const cfg of variants) {
      const candidate = buildBottomLine(payload, {
        ...cfg,
        model,
        brand,
        noColor,
      });
      if (displayWidth(candidate) <= terminalWidth) {
        return candidate;
      }
    }
  }

  if (model) {
    for (const cfg of variants) {
      const candidate = buildBottomLine(payload, {
        ...cfg,
        model,
        brand: null,
        noColor,
      });
      if (displayWidth(candidate) <= terminalWidth) {
        return candidate;
      }
    }
  }

  if (brand) {
    for (const cfg of variants) {
      const candidate = buildBottomLine(payload, {
        ...cfg,
        model: null,
        brand,
        noColor,
      });
      if (displayWidth(candidate) <= terminalWidth) {
        return candidate;
      }
    }
  }

  let fallback = '';
  for (const cfg of variants) {
    fallback = buildBottomLine(payload, {
      ...cfg,
      model: null,
      brand: null,
      noColor,
    });
    if (displayWidth(fallback) <= terminalWidth) {
      return fallback;
    }
  }

  return truncateToWidth(fallback, terminalWidth, { noColor });
}

function tryBuildPixelLayout(
  safePayload,
  {
    quotaBarWidth,
    contextBarWidth,
    showTokens,
    model,
    pixelBrand,
    lineGap,
    terminalWidth,
    noColor,
    nowMs,
  }
) {
  const sep = style(' │ ', fgRgb(65, 72, 104), noColor);
  const sepWidth = displayWidth(sep);
  const quotaWidths = quotaBarWidth > 6 ? [quotaBarWidth, 6] : [quotaBarWidth];
  const bottomVariants = getWidthVariants(contextBarWidth, showTokens);

  for (const qw of quotaWidths) {
    const candidateLine1 = renderQuotaLine(safePayload, {
      barWidth: qw,
      terminalWidth: 0,
      noColor,
      nowMs,
    });
    if (candidateLine1.includes('\n')) {
      continue;
    }

    const w1 = displayWidth(candidateLine1);

    for (const cfg of bottomVariants) {
      const candidateLine2 = buildBottomLine(safePayload, {
        ...cfg,
        model,
        brand: null,
        noColor,
      });
      const w2 = displayWidth(candidateLine2);
      const leftWidth = Math.max(w1, w2);
      const totalWidth = leftWidth + sepWidth + pixelBrand.width;

      if (terminalWidth === 0 || totalWidth <= terminalWidth) {
        const row0 = `${padRightWidth(candidateLine1, leftWidth)}${sep}${pixelBrand.rows[0]}`;
        const row1 = `${' '.repeat(leftWidth)}${sep}${pixelBrand.rows[1]}`;
        if (lineGap === 1) {
          const row2 = `${padRightWidth(candidateLine2, leftWidth)}${sep}${pixelBrand.rows[2]}`;
          return `${row0}\n${row1}\n${row2}`;
        }
        const row2 = `${' '.repeat(leftWidth)}${sep}${pixelBrand.rows[2]}`;
        return [
          row0,
          row1,
          row2,
          ...Array(lineGap - 2).fill(' '),
          candidateLine2,
        ].join('\n');
      }
    }
  }

  return null;
}

/**
 * Render the Agy HUD status output with quotas, context, activity, model, and pixel brand.
 */
export function renderHud(payload, options = {}) {
  const safePayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const env = options.env ?? process.env;

  const noColor =
    options.noColor !== undefined ? Boolean(options.noColor) : isNoColor(env);

  const showTokens =
    options.showTokens !== undefined
      ? Boolean(options.showTokens)
      : env.AGY_HUD_SHOW_TOKENS !== '0';

  const showModel =
    options.showModel !== undefined
      ? Boolean(options.showModel)
      : env.AGY_HUD_SHOW_MODEL !== '0';

  const quotaBarWidth = parsePositiveInt(
    options.quotaBarWidth ?? env.AGY_HUD_BAR_WIDTH_QUOTA,
    8
  );
  const contextBarWidth = parsePositiveInt(
    options.contextBarWidth ?? env.AGY_HUD_BAR_WIDTH_CONTEXT,
    16
  );
  const rawBrandStyle = String(
    options.brandStyle ?? env.AGY_HUD_BRAND ?? 'pixel'
  )
    .trim()
    .toLowerCase();
  const brandStyle =
    rawBrandStyle === 'mini' || rawBrandStyle === 'off' ? rawBrandStyle : 'pixel';
  const lineGap = parseLineGap(options.lineGap ?? env.AGY_HUD_LINE_GAP, 1);
  const terminalWidth =
    typeof options.terminalWidth === 'number' && options.terminalWidth > 0
      ? Math.floor(options.terminalWidth)
      : typeof safePayload.terminal_width === 'number' && safePayload.terminal_width > 0
        ? Math.floor(safePayload.terminal_width)
        : 0;

  const nowMs = options.nowMs ?? Date.now();
  const model = showModel ? renderModelSegment(safePayload, { noColor }) : null;

  if (brandStyle === 'pixel' && !noColor && lineGap >= 1) {
    const pixelBrand = renderGooglePixelLogo({ noColor: false });
    if (pixelBrand) {
      const pixelLayout = tryBuildPixelLayout(safePayload, {
        quotaBarWidth,
        contextBarWidth,
        showTokens,
        model,
        pixelBrand,
        lineGap,
        terminalWidth,
        noColor,
        nowMs,
      });
      if (pixelLayout) {
        return pixelLayout;
      }
    }
  }

  const miniBrand = brandStyle === 'off' ? null : renderGoogleMiniLogo({ noColor });

  const line1 = renderQuotaLine(safePayload, {
    barWidth: quotaBarWidth,
    terminalWidth,
    noColor,
    nowMs,
  });

  const line2 = renderResponsiveBottomLine(safePayload, {
    barWidth: contextBarWidth,
    showTokens,
    model,
    brand: miniBrand,
    terminalWidth,
    noColor,
  });

  if (lineGap > 0) {
    return [line1, ...Array(lineGap).fill(' '), line2].join('\n');
  }
  return `${line1}\n${line2}`;
}
