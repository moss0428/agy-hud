import { BOLD, fgRgb, style } from './ansi.mjs';

const TRAILING_EFFORT_RE = /\s*\((low|medium|med|high|xhigh|max|minimal)\)\s*$/i;

const EFFORT_LABELS = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
};

function normalizeEffort(raw) {
  const lower = String(raw || '').trim().toLowerCase();
  if (!lower) {
    return '';
  }
  return lower === 'med' ? 'medium' : lower;
}

/**
 * Parse payload.model into a clean model name and normalized reasoning effort.
 */
export function parseModelInfo(payload) {
  const rawModel = payload?.model;
  if (!rawModel) {
    return { name: '', effort: '' };
  }

  let rawName = '';
  let rawEffort = '';

  if (typeof rawModel === 'string') {
    rawName = rawModel.trim();
  } else if (typeof rawModel === 'object' && !Array.isArray(rawModel)) {
    rawName = String(rawModel.display_name || rawModel.id || '').trim();
    rawEffort = String(rawModel.effort || '').trim();
  }

  if (!rawName) {
    return { name: '', effort: '' };
  }

  let effort = normalizeEffort(rawEffort);
  let name = rawName;

  const match = rawName.match(TRAILING_EFFORT_RE);
  if (match) {
    name = rawName.slice(0, match.index).trim();
    if (!effort) {
      effort = normalizeEffort(match[1]);
    }
  }

  return { name, effort };
}

/**
 * Format normalized effort level for display.
 */
export function formatEffortLabel(effort) {
  const normalized = normalizeEffort(effort);
  if (!normalized) {
    return '';
  }
  if (EFFORT_LABELS[normalized]) {
    return EFFORT_LABELS[normalized];
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function modelFamilyStyle(name) {
  if (/gemini/i.test(name)) {
    return { icon: '✦', color: [125, 207, 255] };
  }
  if (/claude/i.test(name)) {
    return { icon: '◈', color: [255, 158, 100] };
  }
  if (/gpt|openai/i.test(name)) {
    return { icon: '◈', color: [115, 218, 202] };
  }
  return { icon: '◆', color: [167, 139, 250] };
}

function effortStyle(effort) {
  if (effort === 'low' || effort === 'minimal') {
    return fgRgb(148, 163, 184);
  }
  if (effort === 'medium') {
    return fgRgb(115, 218, 202);
  }
  if (effort === 'high') {
    return fgRgb(242, 185, 75);
  }
  if (effort === 'xhigh') {
    return [BOLD, fgRgb(255, 158, 100)];
  }
  if (effort === 'max') {
    return [BOLD, fgRgb(247, 118, 142)];
  }
  return fgRgb(169, 177, 214);
}

/**
 * Render current session model and reasoning effort without background ANSI codes.
 */
export function renderModelSegment(payload, { noColor = false } = {}) {
  const { name, effort } = parseModelInfo(payload);
  if (!name) {
    return null;
  }

  const family = modelFamilyStyle(name);
  const iconText = style(family.icon, fgRgb(...family.color), noColor);
  const nameText = style(name, fgRgb(220, 227, 245), noColor);
  const base = `${iconText} ${nameText}`;

  const effortLabel = formatEffortLabel(effort);
  if (!effortLabel) {
    return base;
  }

  const dot = style(' · ', fgRgb(65, 72, 104), noColor);
  const effortText = style(effortLabel, effortStyle(effort), noColor);
  return `${base}${dot}${effortText}`;
}
