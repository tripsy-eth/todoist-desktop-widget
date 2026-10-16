import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucket, dateLabel, dayKey, dueDay, timeLabel } from './tasks.ts';
import { createTaskPayload, emptyDraft } from './task-form.ts';

const task = (id, date) => ({ id, content: id, due: date ? { date, string: 'Due date' } : null });
test('date-only and datetime tasks use the same calendar day', () => {
  const tasks = [task('today', '2026-10-16T18:30:00'), task('future', '2026-10-18T10:00:00Z'), task('past', '2026-10-15'), task('undated', null)];
  const now = new Date(2026, 9, 16, 12);
  assert.deepEqual(bucket(tasks, 'today', now).map(t => t.id), ['today']);
  assert.deepEqual(bucket(tasks, 'upcoming', now).map(t => t.id), ['future']);
  assert.deepEqual(bucket(tasks, 'overdue', now).map(t => t.id), ['past']);
  assert.doesNotThrow(() => dateLabel(tasks[1]));
});
test('invalid dates do not crash the task view', () => {
  for (const raw of ['invalid', '2026-02-31', '2026-99-99', '']) {
    assert.equal(dueDay(task('bad', raw)), null);
    assert.doesNotThrow(() => dateLabel(task('bad', raw)));
  }
});
test('today follows the local calendar rather than UTC', () => {
  const now = new Date(2026, 9, 16, 0, 15);
  assert.equal(dayKey(now), '2026-10-16');
});

test('task times appear for floating, UTC, and explicit datetime values', () => {
  for (const raw of ['2026-10-18T09:30:00', '2026-10-18T09:30:00Z', '2026-10-18T09:30:00+05:30']) {
    const scheduled = task('timed', raw);
    assert.ok(timeLabel(scheduled));
    assert.ok(dateLabel(scheduled).includes(timeLabel(scheduled)));
  }
  assert.equal(timeLabel(task('all-day', '2026-10-18')), null);
  assert.ok(timeLabel({ ...task('explicit', '2026-10-18'), due: { date: '2026-10-18', datetime: '2026-10-18T09:30:00Z' } }));
});

test('full task form sends selected details and converts local time to an instant', () => {
  const draft = { ...emptyDraft, content: '  Plan launch  ', description: 'Notes', project: 'project1', section: 'section1', assignee: '123', priority: '4', date: '2026-10-18', time: '09:30', duration: '30', deadline: '2026-10-20', labels: ['work'], extraLabels: 'work, launch', reminder: '0' };
  const { input, reminder } = createTaskPayload(draft);
  assert.equal(input.content, 'Plan launch');
  assert.equal(input.project_id, 'project1');
  assert.equal(input.section_id, 'section1');
  assert.equal(input.assignee_id, 123);
  assert.equal(input.priority, 4);
  assert.equal(input.description, 'Notes');
  assert.deepEqual(input.labels, ['work', 'launch']);
  assert.equal(input.due_datetime, new Date('2026-10-18T09:30').toISOString());
  assert.equal(input.due_date, undefined);
  assert.equal(input.duration, 30);
  assert.equal(input.deadline_date, '2026-10-20');
  assert.deepEqual(reminder, { minutes: 0, service: 'push' });
});

test('natural-language schedules and invalid form combinations', () => {
  const payload = createTaskPayload({ ...emptyDraft, content: 'Repeat', scheduleMode: 'natural', schedule: 'every Monday at 9am', date: '2026-10-18', time: '09:30' });
  assert.equal(payload.input.due_string, 'every Monday at 9am');
  assert.equal(payload.input.due_datetime, undefined);
  assert.throws(() => createTaskPayload({ ...emptyDraft, content: 'Task', reminder: '15' }), /due date and time/);
  assert.throws(() => createTaskPayload({ ...emptyDraft, content: 'Task', time: '09:30' }), /Choose a date/);
  assert.throws(() => createTaskPayload({ ...emptyDraft, content: 'Task', duration: '-1' }), /positive whole number/);
});
