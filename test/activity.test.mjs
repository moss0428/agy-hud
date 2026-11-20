import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../scripts/lib/ansi.mjs';
import {
  countActiveSubagents,
  countRunningTasks,
  renderActivityLine,
} from '../scripts/lib/activity.mjs';

test('countActiveSubagents filters only active subagent states', () => {
  assert.equal(countActiveSubagents({}), 0);
  assert.equal(
    countActiveSubagents({
      subagents: [
        { name: 'a', status: 'running' },
        { name: 'b', status: 'waiting' },
        { name: 'c', status: 'completed' },
        { name: 'd', status: 'failed' },
        { name: 'e', state: 'working' },
      ],
    }),
    3
  );
});

test('countRunningTasks reads task_count and falls back to background_tasks', () => {
  assert.equal(countRunningTasks({}), 0);
  assert.equal(countRunningTasks({ task_count: 2 }), 2);
  assert.equal(
    countRunningTasks({
      background_tasks: [
        { id: '1', status: 'running' },
        { id: '2', status: 'completed' },
        { id: '3' },
      ],
    }),
    2
  );
});

test('renderActivityLine renders crisp idle icons and pill badges when active', () => {
  const idle = renderActivityLine({});
  assert.equal(stripAnsi(idle), '◇ 子代理 0 · ▹ 后台任务 0');
  assert.ok(!idle.includes('\x1b[1m'), 'zero counts should not use bold highlight');
  assert.ok(!idle.includes('\x1b[2m'), 'should avoid DIM stacking');

  const active = renderActivityLine({
    subagents: [{ name: 's1', status: 'running' }],
    task_count: 3,
  });
  assert.equal(stripAnsi(active), '❖ 子代理  1  · ▸ 后台任务  3 ');
  assert.ok(active.includes('\x1b[1m'), 'active counts should be bold highlighted');
  assert.ok(active.includes('48;2;31;59;77'), 'active subagents should render cyan pill bg');
  assert.ok(active.includes('48;2;28;59;54'), 'active tasks should render mint pill bg');
});
