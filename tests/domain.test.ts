import { describe, expect, it } from 'vitest';
import { addDays, daysUntil, riyadhDate, streak } from '../src/lib/dates';
import { remainingSeconds } from '../src/lib/timer';
import { proposePlan } from '../src/lib/planner';
import type { FocusSession, StudyData, Task, Topic } from '../src/lib/types';

const topic = (id: string, patch: Partial<Topic> = {}): Topic => ({
  id, user_id: 'u', subject_id: 's', title: id, chapter: '', minutes: 60,
  document_id: null, page_start: null, page_end: null, completed: false,
  understanding: null, evidence: null, review_on: null, notes: '', ...patch,
});
const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id, user_id: 'u', topic_id: 'a', day: '2026-10-23', minutes: 25,
  position: 0, status: 'pending', manual: false, kind: 'study', ...patch,
});
const data = (patch: Partial<StudyData> = {}): StudyData => ({
  profile: { user_id: 'u', display_name: '', weekly_minutes: [60, 60, 60, 60, 60, 60, 60], rest_days: [], onboarded: true },
  subjects: [], topics: [topic('a')], documents: [], exams: [], tasks: [], sessions: [], assessments: [], ...patch,
});
const session = (patch: Partial<FocusSession> = {}): FocusSession => ({
  id: 'one', user_id: 'u', topic_id: null, task_id: null, kind: 'focus', status: 'running',
  duration_seconds: 1500, elapsed_seconds: 0, started_at: '2026-10-23T12:00:00Z', completed_at: null,
  version: 1, ...patch,
});

describe('Riyadh calendar and streaks', () => {
  it('changes the day at Riyadh midnight regardless of the machine zone', () => {
    expect(riyadhDate('2026-10-23T20:59:59Z')).toBe('2026-10-23');
    expect(riyadhDate('2026-10-23T21:00:00Z')).toBe('2026-10-24');
    expect(daysUntil('2026-10-24', '2026-10-23')).toBe(1);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(() => daysUntil('2026-02-30')).toThrow();
  });
  it('counts completed focus only and completion date, with no duplicate day', () => {
    const sessions = [
      session({ status: 'completed', completed_at: '2026-10-22T21:01:00Z' }),
      session({ status: 'completed', completed_at: '2026-10-23T01:00:00Z' }),
      session({ status: 'completed', completed_at: '2026-10-23T21:01:00Z' }),
      session({ kind: 'break', status: 'completed', completed_at: '2026-10-24T21:01:00Z' }),
      session({ status: 'cancelled', completed_at: '2026-10-24T21:01:00Z' }),
    ];
    expect(streak(sessions, '2026-10-25')).toEqual({ current: 2, longest: 2, days: ['2026-10-23', '2026-10-24'] });
    expect(streak(sessions, '2026-10-26').current).toBe(0);
  });
  it('does not award future days and preserves the historical longest streak', () => {
    const sessions = ['20', '21', '22', '24', '27'].map(day => session({ status: 'completed', completed_at: `2026-10-${day}T12:00:00Z` }));
    expect(streak(sessions, '2026-10-24')).toEqual({ current: 1, longest: 3, days: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24'] });
  });
});

describe('timestamp timer restoration', () => {
  it('restores remaining time after refresh/background and clamps at zero', () => {
    expect(remainingSeconds(session(), Date.parse('2026-10-23T12:14:30Z'))).toBe(630);
    expect(remainingSeconds(session(), Date.parse('2026-10-23T14:00:00Z'))).toBe(0);
  });
  it('uses accumulated elapsed and last resumed timestamp', () => {
    expect(remainingSeconds(session({ elapsed_seconds: 400, started_at: '2026-10-23T12:10:00Z' }), Date.parse('2026-10-23T12:15:00Z'))).toBe(800);
    expect(remainingSeconds(session({ status: 'paused', elapsed_seconds: 400 }), Date.parse('2026-10-24T12:15:00Z'))).toBe(1100);
    expect(remainingSeconds(session(), Date.parse('2026-10-23T11:50:00Z'))).toBe(1500);
  });
});

describe('capacity-constrained planner', () => {
  it('does not infer available hours or schedule on a rest day', () => {
    const source = data();
    source.profile!.weekly_minutes = [0, 0, 0, 0, 0, 0, 0];
    expect(proposePlan(source, '2026-10-23').tasks).toHaveLength(0);
    source.profile!.weekly_minutes = [60, 60, 60, 60, 60, 60, 60];
    source.profile!.rest_days = [5];
    const plan = proposePlan(source, '2026-10-23');
    expect(plan.tasks[0].day).toBe('2026-10-24');
    expect(plan.tasks.every(task => task.minutes <= 25)).toBe(true);
  });
  it('reserves completed and manually changed work, including deferred tasks', () => {
    const source = data({ topics: [topic('a', { minutes: 100 })], tasks: [
      task('done', { minutes: 15, status: 'done' }),
      task('manual', { minutes: 20, manual: true, position: 1 }),
      task('deferred', { minutes: 10, status: 'deferred', position: 2 }),
      task('replace-me', { minutes: 25, day: '2026-10-24' }),
    ] });
    const original = JSON.stringify(source);
    const plan = proposePlan(source, '2026-10-23');
    expect(plan.tasks.reduce((sum, task) => sum + task.minutes, 0)).toBe(55);
    expect(plan.tasks.filter(task => task.day === '2026-10-23').reduce((sum, task) => sum + task.minutes, 0)).toBe(15);
    expect(plan.tasks.find(task => task.day === '2026-10-23')!.position).toBe(3);
    expect(JSON.stringify(source)).toBe(original);
    expect(plan.tasks.every(task => !task.manual && task.status === 'pending')).toBe(true);
  });
  it('never exceeds capacity across varied workloads and weekly availability', () => {
    for (let size = 1; size < 25; size++) {
      const source = data({ topics: Array.from({ length: size }, (_, i) => topic(`topic-${i}`, { minutes: 7 + i * 19 })) });
      source.profile!.weekly_minutes = [5, 32, 0, 55, 70, 13, 40];
      source.profile!.rest_days = [5];
      const plan = proposePlan(source, '2026-10-23');
      for (let index = 0; index < 30; index++) {
        const day = addDays('2026-10-23', index);
        const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
        const used = plan.tasks.filter(task => task.day === day).reduce((sum, task) => sum + task.minutes, 0);
        expect(used).toBeLessThanOrEqual(weekday === 5 ? 0 : source.profile!.weekly_minutes[weekday]);
      }
    }
  });
  it('honors exam scope, schedules before exam day, and reports overload honestly', () => {
    const source = data({ topics: [topic('a', { minutes: 100 }), topic('b', { minutes: 100 })], exams: [{
      id: 'exam', user_id: 'u', subject_id: 's', title: 'الميد', exam_on: '2026-10-24', topic_ids: ['a'],
    }] });
    const plan = proposePlan(source, '2026-10-23');
    expect(plan.tasks.filter(task => task.topic_id === 'a').every(task => task.day < '2026-10-24')).toBe(true);
    expect(plan.tasks.filter(task => task.topic_id === 'a').reduce((sum, task) => sum + task.minutes, 0)).toBe(60);
    expect(plan.tasks.some(task => task.topic_id === 'b' && task.day >= '2026-10-24')).toBe(true);
    expect(plan.warnings.join(' ')).toContain('باقي 40 دقيقة');
  });
  it('keeps overdue manual work visible without silently replacing it', () => {
    const plan = proposePlan(data({ tasks: [task('manual', { day: '2026-10-22', manual: true, minutes: 60 })] }), '2026-10-23');
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings.join(' ')).toContain('فات يومها');
  });
  it('returns weak completed topics to review without treating them as mastery', () => {
    const plan = proposePlan(data({ topics: [topic('a', { completed: true, understanding: 'understood', evidence: 'no', review_on: '2026-10-22' })] }), '2026-10-23');
    expect(plan.tasks[0]).toMatchObject({ kind: 'review', day: '2026-10-23', minutes: 25 });
    expect(plan.reasons.a).toContain('بدون الحل');
  });
  it('does not schedule review while study is only reserved manually', () => {
    const plan = proposePlan(data({ topics: [topic('a', { understanding: 'unclear' })], tasks: [task('manual', { day: '2026-10-24', manual: true, minutes: 60 })] }), '2026-10-23');
    expect(plan.tasks).toHaveLength(0);
  });
  it('does not allocate more time when retained work already fills a day', () => {
    const source = data({ tasks: [task('overfull', { manual: true, minutes: 70, topic_id: 'other' })] });
    const plan = proposePlan(source, '2026-10-23');
    expect(plan.tasks.every(task => task.day !== '2026-10-23')).toBe(true);
    expect(plan.warnings.join(' ')).toContain('تتجاوز');
  });
  it('retains the task used by a running or paused session across replanning', () => {
    const plan = proposePlan(data({ tasks: [task('live', { minutes: 60 })], sessions: [session({ task_id: 'live', status: 'paused' })] }), '2026-10-23');
    expect(plan.tasks).toHaveLength(0);
  });
  it('retains a task waiting for assessment after focus completes', () => {
    const source = data({ tasks: [task('awaiting', { minutes: 60 })], sessions: [session({ task_id: 'awaiting', status: 'completed', completed_at: '2026-10-23T12:30:00Z' })] });
    expect(proposePlan(source, '2026-10-23').tasks).toHaveLength(0);
    source.assessments = [{ id: 'rating', user_id: 'u', session_id: 'one', topic_id: 'a', understanding: 'review', evidence: 'no', note: '', created_at: '2026-10-23T12:35:00Z' }];
    expect(proposePlan(source, '2026-10-23').tasks.length).toBeGreaterThan(0);
  });
});
