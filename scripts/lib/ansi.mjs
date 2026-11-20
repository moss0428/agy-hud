export const RESET = '\x1b[0m';
export const DEFAULT_BG = '\x1b[49m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Return true when NO_COLOR is set to a non-empty value.
 */
export function isNoColor(env = process.env) {
  return Boolean(env && env.NO_COLOR && String(env.NO_COLOR).length > 0);
}

/**
 * 256-color foreground escape code.
 */
export function fg256(code) {
  return `\x1b[38;5;${code}m`;
}

/**
 * 256-color background escape code.
 */
export function bg256(code) {
  return `\x1b[48;5;${code}m`;
}

/**
 * TrueColor (24-bit) foreground escape code.
 */
export function fgRgb(r, g, b) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * TrueColor (24-bit) background escape code.
 */
export function bgRgb(r, g, b) {
  return `\x1b[48;2;${r};${g};${b}m`;
}

/**
 * Wrap text with ANSI escape sequence(s) unless noColor is active.
 */
export function style(text, codes, noColor = false) {
  const str = String(text);
  if (noColor || !codes) {
    return str;
  }
  const prefix = Array.isArray(codes) ? codes.join('') : String(codes);
  if (!prefix) {
    return str;
  }
  return `${prefix}${str}${RESET}`;
}

/**
 * Strip SGR ANSI escape sequences from text.
 */
export function stripAnsi(str) {
  return String(str).replace(ANSI_REGEX, '');
}

/**
 * Terminal column width for a Unicode code point (1 for ASCII/BMP symbols, 2 for CJK/fullwidth/emoji).
 */
export function charDisplayWidth(codePoint) {
  if (
    codePoint === 0 ||
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint < 0xa0)
  ) {
    return 0;
  }
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3040 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Compute visible terminal column width of a string (ignoring ANSI SGR codes).
 */
export function displayWidth(str) {
  const plain = stripAnsi(str);
  let width = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    width += charDisplayWidth(cp);
  }
  return width;
}

/**
 * ANSI-aware truncation to fit within maxWidth terminal columns.
 */
export function truncateToWidth(str, maxWidth, { noColor = false } = {}) {
  const input = String(str);
  if (maxWidth <= 0) {
    return '';
  }
  if (displayWidth(input) <= maxWidth) {
    return input;
  }
  if (maxWidth === 1) {
    return '…';
  }

  const target = maxWidth - 1;
  let out = '';
  let currentWidth = 0;
  let sawAnsi = false;
  let i = 0;

  while (i < input.length) {
    if (input[i] === '\x1b' && input[i + 1] === '[') {
      const match = input.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (match) {
        out += match[0];
        sawAnsi = true;
        i += match[0].length;
        continue;
      }
    }

    const cp = input.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const w = charDisplayWidth(cp);
    if (currentWidth + w > target) {
      break;
    }
    out += ch;
    currentWidth += w;
    i += ch.length;
  }

  out += '…';
  if (sawAnsi && !noColor) {
    out += RESET;
  }
  return out;
}
