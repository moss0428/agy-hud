import { BOLD, DEFAULT_BG, RESET, bgRgb, displayWidth, fgRgb, style } from './ansi.mjs';

export const BRAND_PIXEL_WIDTH = 27;
export const BRAND_PIXEL_ROWS = 3;

export const GOOGLE_PALETTE = {
  B: [66, 133, 244],  // #4285F4 Google Blue
  R: [234, 67, 53],   // #EA4335 Google Red
  Y: [251, 188, 5],   // #FBBC05 Google Yellow
  G: [52, 168, 83],   // #34A853 Google Green
};

// 6 rows x 27 columns rendered into 3 terminal rows via Unicode half-blocks.
// Cols: 0-4(G) 6-9(o) 11-14(o) 16-19(g) 21(l) 23-26(e)
export const GOOGLE_PIXEL_GRID = [
  '.BBBB................G.....',
  'B......RR...YY...BBB.G..RR.',
  'B..BB.R..R.Y..Y.B..B.G.RRRR',
  'B...B.R..R.Y..Y..BBB.G.R...',
  '.BBBB..RR...YY.....B.G..RRR',
  '................BBB........',
];

function colorKey(rgb) {
  return rgb ? `${rgb[0]},${rgb[1]},${rgb[2]}` : null;
}

/**
 * Render a top/bottom-paired pixel matrix into transparent terminal rows.
 */
export function renderTransparentPixelGrid(grid, palette = GOOGLE_PALETTE) {
  if (!Array.isArray(grid) || grid.length === 0 || grid.length % 2 !== 0) {
    throw new Error('Pixel grid must contain an even number of rows.');
  }

  const width = grid[0].length;
  const rows = [];

  for (let rowPair = 0; rowPair < grid.length; rowPair += 2) {
    const topRow = grid[rowPair];
    const bottomRow = grid[rowPair + 1];
    if (topRow.length !== width || bottomRow.length !== width) {
      throw new Error('All pixel grid rows must have equal length.');
    }

    let line = '';
    let curFg = null;
    let curBg = null;

    for (let col = 0; col < width; col += 1) {
      const topChar = topRow[col];
      const botChar = bottomRow[col];
      const topRgb = palette[topChar] ?? null;
      const botRgb = palette[botChar] ?? null;

      let cellChar = ' ';
      let wantFg = null;
      let wantBg = null;

      if (topRgb && botRgb) {
        if (topChar === botChar || colorKey(topRgb) === colorKey(botRgb)) {
          cellChar = '█';
          wantFg = topRgb;
        } else {
          cellChar = '▀';
          wantFg = topRgb;
          wantBg = botRgb;
        }
      } else if (topRgb) {
        cellChar = '▀';
        wantFg = topRgb;
      } else if (botRgb) {
        cellChar = '▄';
        wantFg = botRgb;
      }

      const wantFgKey = colorKey(wantFg);
      const wantBgKey = colorKey(wantBg);

      if (curBg !== wantBgKey) {
        line += wantBg ? bgRgb(wantBg[0], wantBg[1], wantBg[2]) : DEFAULT_BG;
        curBg = wantBgKey;
      }

      if (wantFgKey !== null && curFg !== wantFgKey) {
        line += fgRgb(wantFg[0], wantFg[1], wantFg[2]);
        curFg = wantFgKey;
      }

      line += cellChar;
    }

    if (curFg !== null || curBg !== null) {
      line += RESET;
    }

    rows.push(line);
  }

  return {
    rows,
    width,
  };
}

/**
 * Render the 3-row transparent-background TrueColor pixel Google wordmark.
 */
export function renderGooglePixelLogo(options = {}) {
  if (options.noColor) {
    return null;
  }

  return renderTransparentPixelGrid(GOOGLE_PIXEL_GRID, GOOGLE_PALETTE);
}

/**
 * Render a compact single-row TrueColor Google wordmark for narrow layouts.
 */
export function renderGoogleMiniLogo(options = {}) {
  const noColor = Boolean(options.noColor);
  if (noColor) {
    return {
      text: 'Google',
      width: 6,
    };
  }

  const letters = [
    ['G', GOOGLE_PALETTE.B],
    ['o', GOOGLE_PALETTE.R],
    ['o', GOOGLE_PALETTE.Y],
    ['g', GOOGLE_PALETTE.B],
    ['l', GOOGLE_PALETTE.G],
    ['e', GOOGLE_PALETTE.R],
  ];

  const text = letters
    .map(([ch, [r, g, b]]) => style(ch, [BOLD, fgRgb(r, g, b)], false))
    .join('');

  return {
    text,
    width: displayWidth(text),
  };
}
