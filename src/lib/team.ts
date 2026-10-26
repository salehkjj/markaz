import {check,db} from './supabase';
import {riyadhDate} from './dates';
import type {FocusSession,SessionClosure} from './types';
export type Office={id:string;owner_id:string;name:string;created_at:string};
export type OfficeRole='owner'|'manager'|'deputy'|'member';
export const roleLabel:Record<OfficeRole,string>={owner:'المالك',manager:'مدير',deputy:'نائب',member:'عضو'};
export const canManage=(role:OfficeRole|undefined)=>role==='owner'||role==='manager'||role==='deputy';
export const canApprove=(role:OfficeRole|undefined)=>role==='owner'||role==='manager';
export type Member={office_id:string;user_id:string;role:OfficeRole;member_name:string;joined_at:string};
export type Project={id:string;office_id:string;name:string;description:string;status:WorkStatus;due_on:string|null;created_by:string;created_at:string;updated_at:string;archived_at:string|null};
export type WorkStatus='planned'|'active'|'blocked'|'done';
export type TeamTask={id:string;office_id:string;project_id:string;title:string;assignee_id:string;status:WorkStatus;priority:'low'|'normal'|'high';due_on:string|null;notes:string;blocker_reason:string;blocked_by:string|null;goal_week_start:string|null;created_by:string;created_at:string;updated_at:string};
export type Decision={id:string;office_id:string;project_id:string;title:string;reason:string;outcome:string;decider_id:string|null;due_on:string|null;status:'pending'|'approved';created_by:string;decided_by:string|null;decided_at:string|null;created_at:string};
export type Asset={id:string;office_id:string;project_id:string;name:string;kind:'file'|'link';url:string|null;storage_path:string|null;reference_id:string;version:number;approved:boolean;archived_at:string|null;mime_type:string|null;size_bytes:number|null;added_by:string;created_at:string};
export type TaskComment={id:string;office_id:string;task_id:string;author_id:string;body:string;created_at:string};
export type OfficeDashboard={today_count:number;overdue_count:number;upcoming_count:number;undated_count:number;blocker_count:number;decision_count:number;today_tasks:TeamTask[];overdue_tasks:TeamTask[];upcoming_tasks:TeamTask[];undated_tasks:TeamTask[];blockers:TeamTask[];decisions:Decision[];next_due:{id:string;title:string;due_on:string;kind:'task'|'project'}|null};
export type Goal={office_id:string;week_start:string;goal:string;updated_by:string;updated_at:string};
export type WeeklyUpdate={office_id:string;week_start:string;user_id:string;done:string;next:string;blocker:string;updated_at:string};
export type Invite={id:string;office_id:string;email:string;expires_at:string;revoked_at:string|null;accepted_at:string|null;created_at:string};
export type TeamData={members:Member[];projects:Project[];tasks:TeamTask[];decisions:Decision[];assets:Asset[];goals:Goal[];updates:WeeklyUpdate[];invites:Invite[];sessions:FocusSession[];closures:SessionClosure[];focusDays:string[];dashboard:OfficeDashboard;more:Partial<Record<'tasks'|'decisions'|'assets',boolean>>};
export const workStatus:Record<WorkStatus,string>={planned:'مخطط',active:'جارٍ',blocked:'متعطل',done:'مكتمل'};
export function weekStart(day:string){const date=new Date(day+'T00:00:00Z');const weekday=date.getUTCDay();date.setUTCDate(date.getUTCDate()-((weekday+6)%7));return date.toISOString().slice(0,10);}
export async function listOffices(userId:string):Promise<Office[]>{
 const memberships=check(await db().from('office_members').select('office_id').eq('user_id',userId).limit(100)).data??[];
 if(!memberships.length)return [];
 return check(await db().from('offices').select('*').in('id',memberships.map(m=>m.office_id)).order('created_at',{ascending:false})).data as Office[]??[];
}
export async function loadTeam(officeId:string,userId:string,limit=100):Promise<TeamData>{
 const fixed=['office_members','office_projects','office_weekly_goals','office_weekly_updates'] as const;
 const paged=['office_tasks','office_decisions','office_assets'] as const;
 const week=weekStart(riyadhDate());
 const queries=[...fixed.map(table=>{const base=db().from(table).select('*').eq('office_id',officeId);return table.startsWith('office_weekly_')?base.eq('week_start',week).limit(50):base.limit(table==='office_members'?50:200);}),...paged.map(table=>db().from(table).select('*').eq('office_id',officeId).order('created_at',{ascending:false}).range(0,limit))];
 const results=await Promise.all([...queries,db().from('office_invites').select('id,office_id,email,expires_at,revoked_at,accepted_at,created_at').eq('office_id',officeId).order('created_at',{ascending:false}).limit(50),db().from('sessions').select('*').eq('user_id',userId).neq('status','cancelled').order('completed_at',{ascending:false,nullsFirst:true}).limit(40),db().from('session_closures').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(80),db().rpc('my_focus_days'),db().rpc('office_dashboard',{p_office:officeId})]);
 const rows=results.map(result=>check(result).data??[]);
 return {members:rows[0] as Member[],projects:rows[1] as Project[],goals:rows[2] as Goal[],updates:rows[3] as WeeklyUpdate[],tasks:rows[4] as TeamTask[],decisions:rows[5] as Decision[],assets:rows[6] as Asset[],invites:rows[7] as Invite[],sessions:rows[8] as FocusSession[],closures:rows[9] as SessionClosure[],focusDays:check(results[10]).data as string[]??[],dashboard:check(results[11]).data as OfficeDashboard,more:{tasks:rows[4].length>limit,decisions:rows[5].length>limit,assets:rows[6].length>limit}};
}
