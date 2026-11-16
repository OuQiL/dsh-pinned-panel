// Pure-logic tests for the sidebar group. Run with `node --test test/**/*.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHooks } from './harness.mjs';

const hooks = loadHooks();
/** Dictionary stub: returns the key, so assertions also pin the key names. */
const t = (key) => key;
/** Copy vm-realm values into this realm so deepStrictEqual compares contents, not prototypes. */
const plain = (value) => JSON.parse(JSON.stringify(value));

const pad2 = (value) => (value < 10 ? `0${value}` : String(value));

test('the bundle exposes a consistent version and archived page size', () => {
  assert.match(hooks.VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(hooks.ARCHIVED_PAGE, 10);
});

test('toMillis normalizes milliseconds, seconds and ISO strings', () => {
  assert.equal(hooks.toMillis(1_700_000_000_000), 1_700_000_000_000);
  assert.equal(hooks.toMillis(1_700_000_000), 1_700_000_000_000);
  const iso = '2026-10-26T05:50:00.000Z';
  assert.equal(hooks.toMillis(iso), Date.parse(iso));
  assert.ok(Number.isNaN(hooks.toMillis('not a date')));
  assert.ok(Number.isNaN(hooks.toMillis(undefined)));
  assert.ok(Number.isNaN(hooks.toMillis(null)));
});

test('timeLabel prints a clock for today and a date for older rows', () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 7, 0, 0);
  assert.equal(hooks.timeLabel(today.getTime()), '09:07');

  const older = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
  const clock = `${pad2(older.getHours())}:${pad2(older.getMinutes())}`;
  const day = `${pad2(older.getMonth() + 1)}-${pad2(older.getDate())}`;
  const expected = older.getFullYear() === now.getFullYear()
    ? `${day} ${clock}`
    : `${older.getFullYear()}-${day} ${clock}`;
  assert.equal(hooks.timeLabel(older.getTime()), expected);
  assert.equal(hooks.timeLabel('nope'), '');
});

test('sessionIdOf prefers id and falls back to sessionId', () => {
  assert.equal(hooks.sessionIdOf({ id: 'a' }), 'a');
  assert.equal(hooks.sessionIdOf({ sessionId: 'b' }), 'b');
  assert.equal(hooks.sessionIdOf({}), '');
  assert.equal(hooks.sessionIdOf(null), '');
});

test('sessionTitle falls back through title, displayTitle and placeholders', () => {
  assert.equal(hooks.sessionTitle({ title: '  Fix login  ' }, t), 'Fix login');
  assert.equal(hooks.sessionTitle({ displayTitle: 'Inherited' }, t), 'Inherited');
  assert.equal(hooks.sessionTitle({ blank: true }, t), 'newSession');
  assert.equal(hooks.sessionTitle({}, t), 'untitled');
  assert.equal(hooks.sessionTitle({ title: '   ' }, t), 'untitled');
});

test('workspaceLabel localizes the default workspace and falls back to the path', () => {
  assert.equal(hooks.workspaceLabel({ title: 'proj' }, t), 'proj');
  assert.equal(hooks.workspaceLabel({ title: 'default-workspace' }, t), 'defaultWorkspace');
  assert.equal(hooks.workspaceLabel({ path: 'C:\\work\\thing' }, t), 'C:\\work\\thing');
  assert.equal(hooks.workspaceLabel({}, t), 'ungrouped');
});

test('byUpdatedDesc orders newest first and breaks ties by id', () => {
  const rows = [
    { id: 'b', updatedAt: 100 },
    { id: 'a', updatedAt: 300 },
    { id: 'c', updatedAt: 300 },
  ];
  const sorted = rows.slice().sort(hooks.byUpdatedDesc);
  assert.deepEqual(plain(sorted.map((row) => row.id)), ['a', 'c', 'b']);
});

test('sidebarRows keeps pinned, drops archived and unknown, sorts and labels', () => {
  const items = [
    { title: 'proj-a', sessionIds: ['s1', 's2', 's3', 'gone'] },
    { title: 'default-workspace', sessionIds: ['s4'] },
  ];
  const byId = {
    s1: { id: 's1', title: 'one', updatedAt: 100 },
    s2: { id: 's2', title: 'two', updatedAt: 300 },
    s3: { id: 's3', title: 'three', updatedAt: 200 },
    s4: { id: 's4', title: 'four', updatedAt: 400 },
    gone: { id: 'gone', title: 'archived', updatedAt: 500 },
  };
  const rows = plain(hooks.sidebarRows(items, ['s1', 's2', 's3', 'gone', 'missing'], byId, ['gone'], t));
  assert.deepEqual(rows.map((row) => row.summary.id), ['s2', 's3', 's1']);
  assert.deepEqual(rows.map((row) => row.workspace), ['proj-a', 'proj-a', 'proj-a']);
});

test('sidebarRows tolerates missing snapshots', () => {
  assert.deepEqual(plain(hooks.sidebarRows(undefined, undefined, undefined, undefined, t)), []);
  assert.deepEqual(plain(hooks.sidebarRows([], ['s1'], {}, [], t)), []);
});

test('sidebarArchivedRows lists archived sessions newest first with labels', () => {
  const items = [{ title: 'proj-a', sessionIds: ['a1', 'a2'] }];
  const byId = {
    a1: { id: 'a1', title: 'old', updatedAt: 100 },
    a2: { id: 'a2', title: 'new', updatedAt: 900 },
  };
  const rows = plain(hooks.sidebarArchivedRows(items, ['a1', 'a2', 'nope'], byId, t));
  assert.deepEqual(rows.map((row) => row.summary.id), ['a2', 'a1']);
  assert.deepEqual(rows.map((row) => row.workspace), ['proj-a', 'proj-a']);
});

test('rowActivity prefers a pending interaction, then running, then unread', () => {
  assert.deepEqual(plain(hooks.rowActivity({ pendingInteraction: { kind: 'approval' }, running: true }, {})), {
    tone: 'warning',
    label: 'statusApproval',
  });
  assert.deepEqual(plain(hooks.rowActivity({ pendingInteraction: { kind: 'plan-review' } }, {})), {
    tone: 'warning',
    label: 'statusPlanReview',
  });
  assert.deepEqual(plain(hooks.rowActivity({ pendingInteraction: { kind: 'question' } }, {})), {
    tone: 'warning',
    label: 'statusQuestion',
  });
  assert.deepEqual(plain(hooks.rowActivity({ running: true }, {})), { tone: 'ongoing', label: 'statusRunning' });
  assert.deepEqual(plain(hooks.rowActivity({ completionUnread: true }, {})), { tone: 'done', label: 'statusDone' });
  assert.equal(hooks.rowActivity({}, {}), null);
  assert.equal(hooks.rowActivity(undefined, {}), null);
});

test('rowActivity falls back to the session summary while the status store is cold', () => {
  assert.deepEqual(plain(hooks.rowActivity(undefined, { running: true })), { tone: 'ongoing', label: 'statusRunning' });
  assert.equal(hooks.rowActivity({ running: false }, { running: true }), null);
});
