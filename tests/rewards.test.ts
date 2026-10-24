import {describe,it,expect} from 'vitest';
import {rewards} from '../src/lib/rewards';
import {addDays} from '../src/lib/dates';
import type {FocusSession} from '../src/lib/types';
const session=(day:string,kind:'focus'|'break'='focus',status:FocusSession['status']='completed'):FocusSession=>({id:day,user_id:'test',topic_id:null,task_id:null,kind,status,duration_seconds:1500,elapsed_seconds:1500,started_at:null,completed_at:day+'T12:00:00+03:00',version:1});
const days=(n:number)=>Array.from({length:n},(_,i)=>session(addDays('2026-10-01',i)));
describe('earned streak points',()=>{
 it('unlocks the fifth day and never awards duplicate sessions',()=>{const s=days(5);expect(rewards([...s,s[4]],'2026-10-05')).toMatchObject({current:5,cycle:5,points:75,bonuses:1});});
 it('unlocks both tomatoes at ten days then opens a new track',()=>{expect(rewards(days(10),'2026-10-10')).toMatchObject({cycle:10,points:150});expect(rewards(days(11),'2026-10-11')).toMatchObject({cycle:1,points:160});});
 it('retains earned points after a missed day without granting another milestone',()=>{expect(rewards([...days(5),session('2026-10-08')],'2026-10-08')).toMatchObject({cycle:1,points:85,bonuses:1});});
 it('ignores breaks cancelled sessions and future completions',()=>{expect(rewards([session('2026-10-01','break'),session('2026-10-01','focus','cancelled'),session('2026-10-03')],'2026-10-01')).toMatchObject({points:0,current:0});});
 it('counts the completion day in Riyadh at midnight',()=>{const s=session('2026-10-01');s.completed_at='2026-10-01T21:01:00Z';expect(rewards([s],'2026-10-02')).toMatchObject({points:10,current:1});});
});
