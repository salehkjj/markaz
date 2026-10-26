'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {MessageSquare,Send} from 'lucide-react';
import {db,check} from '@/lib/supabase';
import {errorMessage} from '@/lib/data';
import type {Member,TaskComment} from '@/lib/team';

export function TaskComments({officeId,taskId,userId,members}:{officeId:string;taskId:string;userId:string;members:Member[]}){
 const [comments,setComments]=useState<TaskComment[]>([]),[draft,setDraft]=useState(''),[limit,setLimit]=useState(30);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const request=useRef(0);
 const load=useCallback(async()=>{
  const id=++request.current;
  setLoading(true);
  try{const result=check(await db().from('office_task_comments').select('*').eq('office_id',officeId).eq('task_id',taskId).order('created_at',{ascending:false}).range(0,limit));if(id===request.current){setComments((result.data??[]) as TaskComment[]);setError('');}}
  catch(e){if(id===request.current)setError(errorMessage(e));}
  finally{if(id===request.current)setLoading(false);}
 },[officeId,taskId,limit]);
 useEffect(()=>{void load();return()=>{request.current++;};},[load]);
 async function add(e:FormEvent){e.preventDefault();if(!draft.trim()||saving)return;setSaving(true);try{check(await db().from('office_task_comments').insert({office_id:officeId,task_id:taskId,author_id:userId,body:draft.trim()}).select('id').single());setDraft('');await load();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
 return <section className="stack task-comments" aria-label="تعليقات المهمة"><h3><MessageSquare size={18}/> التعليقات</h3>{error&&<p role="alert" className="notice error">{error}<button className="text-button" onClick={()=>void load()}>أعد المحاولة</button></p>}{loading?<p role="status" className="muted">نحمّل التعليقات…</p>:comments.length===0?<p className="muted">ما فيه تعليقات بعد.</p>:<div className="stack">{comments.map(comment=><article className="comment-card" key={comment.id}><p><strong>{members.find(m=>m.user_id===comment.author_id)?.member_name??'عضو سابق'}</strong> <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('ar-SA')}</time></p><p>{comment.body}</p></article>)}{comments.length>limit&&<button className="button ghost small" onClick={()=>setLimit(x=>x+30)}>تعليقات أقدم</button>}</div>}<form onSubmit={e=>void add(e)} className="row wrap"><label className="field">تعليق<input maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="أضف تحديثًا قصيرًا"/></label><button className="button small" disabled={saving||!draft.trim()}><Send size={16}/>{saving?'جارٍ الحفظ…':'أرسل'}</button></form></section>;
}
