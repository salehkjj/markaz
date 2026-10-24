export type Understanding = 'understood' | 'review' | 'unclear';
export type Evidence = 'yes' | 'no' | 'untried';
export interface Profile { user_id:string; display_name:string; weekly_minutes:number[]; rest_days:number[]; onboarded:boolean }
export interface Subject { id:string; user_id:string; title:string; color:string; created_at:string; kind:'study'|'work'; project_status:'planned'|'active'|'completed' }
export interface Topic { id:string; user_id:string; subject_id:string|null; title:string; chapter:string; minutes:number; document_id:string|null; page_start:number|null; page_end:number|null; completed:boolean; understanding:Understanding|null; evidence:Evidence|null; review_on:string|null; notes:string; mode:'study'|'work'; priority:'low'|'normal'|'high'; due_on:string|null; work_state:'todo'|'blocked'|'done' }
export interface Exam { id:string; user_id:string; subject_id:string; title:string; exam_on:string; topic_ids:string[] }
export interface StudyDocument { id:string; user_id:string; subject_id:string; name:string; storage_path:string; pages:number|null }
export interface Task { id:string; user_id:string; topic_id:string; day:string; minutes:number; position:number; status:'pending'|'done'|'deferred'; manual:boolean; kind:'study'|'review' }
export interface FocusSession { id:string; user_id:string; topic_id:string|null; task_id:string|null; office_task_id?:string|null; kind:'focus'|'break'; status:'running'|'paused'|'completed'|'cancelled'; duration_seconds:number; elapsed_seconds:number; started_at:string|null; completed_at:string|null; version:number }
export interface Assessment { id:string; user_id:string; session_id:string; topic_id:string|null; understanding:Understanding; evidence:Evidence; note:string; created_at:string }
export interface SessionClosure { id:string; user_id:string; session_id:string; topic_id:string|null; outcome:'done'|'blocked'|'skipped'; note:string; created_at:string }
export interface StudyData { profile:Profile|null; subjects:Subject[]; topics:Topic[]; exams:Exam[]; documents:StudyDocument[]; tasks:Task[]; sessions:FocusSession[]; assessments:Assessment[]; session_closures:SessionClosure[] }
export interface ViewProps { data:StudyData; userId:string; refresh:()=>Promise<void>; run:(action:()=>Promise<unknown>, message?:string)=>Promise<boolean>; busy:boolean }
