import { BOLD, bgRgb, displayWidth, fgRgb, style, truncateToWidth } from './ansi.mjs';

export const ACTIVE_SUBAGENT_STATUSES = new Set([
  'running',
  'working',
  'active',
  'in_progress',
  'pending',
  'waiting',
]);

const FINISHED_TASK_STATUSES = new Set([
  'completed',
  'done',
  'failed',
  'killed',
  'cancelled',
  'canceled',
  'error',
]);

/**
 * Count currently active subagents from payload.subagents.
 */
export function countActiveSubagents(payload) {
  if (!Array.isArray(payload?.subagents)) {
    return 0;
  }
  let count = 0;
  for (const item of payload.subagents) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const status = String(item.status ?? item.state ?? '').trim().toLowerCase();
    if (ACTIVE_SUBAGENT_STATUSES.has(status)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Count running background tasks from payload.task_count, falling back to background_tasks.
 */
export function countRunningTasks(payload) {
  if (typeof payload?.task_count === 'number' && Number.isFinite(payload.task_count)) {
    return Math.max(0, Math.floor(payload.task_count));
  }
  if (Array.isArray(payload?.background_tasks)) {
    let count = 0;
    for (const task of payload.background_tasks) {
      if (!task || typeof task !== 'object') {
        continue;
      }
      const status = String(task.status ?? task.state ?? '').trim().toLowerCase();
      if (!status || !FINISHED_TASK_STATUSES.has(status)) {
        count += 1;
      }
    }
    return count;
  }
  return 0;
}

/**
 * Render the subagents & background tasks segment with crisp icons and count pills.
 */
export function renderActivitySegment(payload, { noColor = false } = {}) {
  const activeSubagents = countActiveSubagents(payload);
  const runningTasks = countRunningTasks(payload);

  const subagentText =
    activeSubagents > 0
      ? `${style('❖', fgRgb(125, 207, 255), noColor)} ${style('子代理', fgRgb(192, 202, 245), noColor)} ${style(` ${activeSubagents} `, [BOLD, fgRgb(125, 207, 255), bgRgb(31, 59, 77)], noColor)}`
      : `${style('◇', fgRgb(86, 95, 137), noColor)} ${style('子代理', fgRgb(120, 130, 164), noColor)} ${style('0', fgRgb(107, 117, 152), noColor)}`;

  const taskText =
    runningTasks > 0
      ? `${style('▸', fgRgb(115, 218, 202), noColor)} ${style('后台任务', fgRgb(192, 202, 245), noColor)} ${style(` ${runningTasks} `, [BOLD, fgRgb(115, 218, 202), bgRgb(28, 59, 54)], noColor)}`
      : `${style('▹', fgRgb(86, 95, 137), noColor)} ${style('后台任务', fgRgb(120, 130, 164), noColor)} ${style('0', fgRgb(107, 117, 152), noColor)}`;

  const sep = style(' · ', fgRgb(65, 72, 104), noColor);
  return `${subagentText}${sep}${taskText}`;
}

/**
 * Render standalone activity line with optional terminal width truncation.
 */
export function renderActivityLine(
  payload,
  { terminalWidth = 0, noColor = false } = {}
) {
  const line = renderActivitySegment(payload, { noColor });
  if (terminalWidth > 0 && displayWidth(line) > terminalWidth) {
    return truncateToWidth(line, terminalWidth, { noColor });
  }
  return line;
}
