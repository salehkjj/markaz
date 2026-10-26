import {describe,expect,it} from 'vitest';
import {addDays,daysUntil,riyadhDate,streak} from '../src/lib/dates';
import {remainingSeconds} from '../src/lib/timer';
import type {FocusSession} from '../src/lib/types';

const session=(patch:Partial<FocusSession>={}):FocusSession=>({
 id:'one',user_id:'u',topic_id:null,task_id:null,kind:'focus',status:'running',
 duration_seconds:1500,elapsed_seconds:0,started_at:'2026-10-23T12:00:00Z',completed_at:null,version:1,...patch,
});

describe('Riyadh days and personal focus',()=>{
 it('changes the day at Riyadh midnight',()=>{
  expect(riyadhDate('2026-10-23T20:59:59Z')).toBe('2026-10-23');
  expect(riyadhDate('2026-10-23T21:00:00Z')).toBe('2026-10-24');
  expect(daysUntil('2026-10-24','2026-10-23')).toBe(1);
  expect(addDays('2024-02-28',1)).toBe('2024-02-29');
 });
 it('counts a completed focus day once, excluding break and cancellation',()=>{
  const sessions=[session({status:'completed',completed_at:'2026-10-22T21:01:00Z'}),session({status:'completed',completed_at:'2026-10-23T01:00:00Z'}),session({status:'completed',completed_at:'2026-10-23T21:01:00Z'}),session({kind:'break',status:'completed',completed_at:'2026-10-24T21:01:00Z'}),session({status:'cancelled',completed_at:'2026-10-24T21:01:00Z'})];
  expect(streak(sessions,'2026-10-25')).toEqual({current:2,longest:2,days:['2026-10-23','2026-10-24']});
 });
 it('restores remaining time after refresh or backgrounding',()=>{
  expect(remainingSeconds(session(),Date.parse('2026-10-23T12:14:30Z'))).toBe(630);
  expect(remainingSeconds(session(),Date.parse('2026-10-23T14:00:00Z'))).toBe(0);
  expect(remainingSeconds(session({status:'paused',elapsed_seconds:400}),Date.parse('2026-10-24T12:15:00Z'))).toBe(1100);
 });
});
