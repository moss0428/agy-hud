import { BOLD, RESET, bgRgb, fgRgb } from './ansi.mjs';

export const BAR_PALETTES = {
  green: { bg: [39, 133, 99], fg: [248, 250, 252] },
  yellow: { bg: [201, 138, 30], fg: [22, 24, 34] },
  red: { bg: [199, 68, 84], fg: [255, 255, 255] },
  muted: { bg: [74, 82, 104], fg: [220, 226, 240] },
};

export const EMPTY_TRACK = { bg: [46, 52, 71], fg: [192, 202, 245] };

const FRACTION_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

/**
 * Clamp a number into [0, 100], returning 0 if non-finite.
 */
export function clampPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function rgbEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Render an embedded-value progress bar using TrueColor cells with sub-cell
 * fractional edge blocks (`▏▎▍▌▋▊▉`), or ASCII fallback under NO_COLOR.
 */
export function renderProgressBar(
  percent,
  { width = 12, tone = 'green', label, noColor = false } = {}
) {
  const pct = clampPercent(percent);
  const text = label !== undefined ? String(label) : `${Math.round(pct)}%`;

  if (noColor) {
    const trackWidth = Math.max(4, Math.floor(width));
    let filled = Math.round((pct / 100) * trackWidth);
    if (pct > 0 && filled === 0) {
      filled = 1;
    }
    if (pct < 100 && filled === trackWidth) {
      filled = trackWidth - 1;
    }
    return `[${'#'.repeat(filled)}${'.'.repeat(trackWidth - filled)} ${text}]`;
  }

  const totalWidth = Math.max(Math.floor(width), text.length + 2);
  const leftPad = Math.floor((totalWidth - text.length) / 2);
  const rightPad = totalWidth - text.length - leftPad;
  const content = ' '.repeat(leftPad) + text + ' '.repeat(rightPad);

  const exactFilled = (pct / 100) * totalWidth;
  let fullCells = Math.floor(exactFilled);
  let remainder = exactFilled - fullCells;

  if (pct > 0 && exactFilled < 0.125) {
    fullCells = 0;
    remainder = 0.125;
  }
  if (pct < 100 && fullCells >= totalWidth) {
    fullCells = totalWidth - 1;
    remainder = 0.875;
  } else if (pct < 100 && fullCells === totalWidth - 1 && Math.round(remainder * 8) >= 8) {
    remainder = 0.875;
  }

  const palette = BAR_PALETTES[tone] ?? BAR_PALETTES.green;
  const cells = [];

  for (let i = 0; i < totalWidth; i += 1) {
    const ch = content[i];
    if (i < fullCells) {
      cells.push({ ch, fg: palette.fg, bg: palette.bg });
    } else if (i === fullCells && remainder > 0) {
      const eighth = Math.round(remainder * 8);
      if (ch === ' ' && eighth >= 1 && eighth <= 7) {
        cells.push({
          ch: FRACTION_BLOCKS[eighth],
          fg: palette.bg,
          bg: EMPTY_TRACK.bg,
        });
      } else if (eighth >= 4) {
        cells.push({ ch, fg: palette.fg, bg: palette.bg });
      } else {
        cells.push({ ch, fg: EMPTY_TRACK.fg, bg: EMPTY_TRACK.bg });
      }
    } else {
      cells.push({ ch, fg: EMPTY_TRACK.fg, bg: EMPTY_TRACK.bg });
    }
  }

  // Coalesce consecutive cells with identical foreground & background colors
  let out = BOLD;
  let activeFg = null;
  let activeBg = null;

  for (const cell of cells) {
    if (!rgbEqual(activeFg, cell.fg)) {
      out += fgRgb(cell.fg[0], cell.fg[1], cell.fg[2]);
      activeFg = cell.fg;
    }
    if (!rgbEqual(activeBg, cell.bg)) {
      out += bgRgb(cell.bg[0], cell.bg[1], cell.bg[2]);
      activeBg = cell.bg;
    }
    out += cell.ch;
  }

  out += RESET;
  return out;
}
