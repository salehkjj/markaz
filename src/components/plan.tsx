'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Check, Clock3, FileText, Pencil, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { db, check } from '@/lib/supabase';
import { errorMessage } from '@/lib/data';
import { addDays, riyadhDate } from '@/lib/dates';
import { proposePlan } from '@/lib/planner';
import type { Task, ViewProps } from '@/lib/types';

type Proposal = ReturnType<typeof proposePlan>;
const number = (value:number) => value.toLocaleString('ar-SA');
const dateLabel = (day:string) => new Intl.DateTimeFormat('ar-SA', {weekday:'long',day:'numeric',month:'long',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(day+'T12:00:00+03:00'));
const dayIndex = (day:string) => new Date(day+'T12:00:00Z').getUTCDay();

export function Plan({data, userId, run, busy, onStart}:ViewProps & {onStart:(topicId?:string, taskId?:string)=>void}) {
  const today = riyadhDate();
  const [proposal, setProposal] = useState<Proposal|null>(null);
  const [proposalSnapshot, setProposalSnapshot] = useState('');
  const [filter, setFilter] = useState<'pending'|'done'|'deferred'>('pending');
  const [editing, setEditing] = useState<string|null>(null);
  const [draft, setDraft] = useState({day:today,minutes:25});
  const [postponing, setPostponing] = useState<string|null>(null);
  const [newDay, setNewDay] = useState(addDays(today,1));
  const [deleting, setDeleting] = useState<string|null>(null);
  const [sourceUrls, setSourceUrls] = useState<Record<string,string>>({});
  const [sourceError, setSourceError] = useState('');
  const [loadingSource, setLoadingSource] = useState<string|null>(null);
  const snapshot = JSON.stringify([data.tasks,data.topics,data.exams,data.profile]);
  const capacity = (day:string) => !data.profile || data.profile.rest_days.includes(dayIndex(day)) ? 0 : data.profile.weekly_minutes[dayIndex(day)] || 0;
  const topic = (task:Task) => data.topics.find(item=>item.id===task.topic_id);
  const subject = (task:Task) => data.subjects.find(item=>item.id===topic(task)?.subject_id);
  const allDayTasks = (day:string) => data.tasks.filter(task=>task.day===day).sort((a,b)=>a.position-b.position || a.id.localeCompare(b.id));
  const filtered = data.tasks.filter(task=>task.status===filter).sort((a,b)=>a.day.localeCompare(b.day)||a.position-b.position||a.id.localeCompare(b.id));
  const days = [...new Set(filtered.map(task=>task.day))];
  const overdue = data.tasks.filter(task=>task.status!=='done' && task.day<today);

  function propose() {
    setProposal(proposePlan(data,today));
    setProposalSnapshot(snapshot);
  }
  async function acceptProposal() {
    if (!proposal) return;
    const success = await run(async()=>{
      if (proposalSnapshot !== snapshot) throw new Error('تغيّرت بياناتك بعد الاقتراح. حدّث الاقتراح قبل اعتماده.');
      check(await db().rpc('replace_plan',{p_tasks:proposal.tasks}));
    },'انحفظت خطتك. ابدأ بأول خطوة.');
    if (success) setProposal(null);
  }
  async function editTask(task:Task) {
    const success = await run(async()=>{
      if (!draft.day || draft.day<today) throw new Error('اختر اليوم أو تاريخًا بعده.');
      if (!Number.isInteger(draft.minutes) || draft.minutes<1 || draft.minutes>480) throw new Error('المدة تكون من دقيقة إلى ٤٨٠ دقيقة.');
      const reserved=data.tasks.filter(item=>item.day===draft.day && item.id!==task.id).reduce((sum,item)=>sum+item.minutes,0);
      if(reserved+draft.minutes>capacity(draft.day)) throw new Error('المدة تتجاوز وقتك المتاح لهذا اليوم. خفّض المدة أو اختر يومًا آخر.');
      check(await db().from('tasks').update({day:draft.day,minutes:draft.minutes,manual:true}).eq('id',task.id).eq('user_id',userId).select('id').single());
    },'انحفظ تعديلك، والاقتراح القادم بيحافظ عليه.');
    if(success) setEditing(null);
  }
  async function postpone(task:Task) {
    const success=await run(async()=>{
      if(!newDay || newDay<today || newDay===task.day) throw new Error('اختر موعدًا جديدًا من اليوم وما بعده.');
      const reserved=data.tasks.filter(item=>item.day===newDay && item.id!==task.id).reduce((sum,item)=>sum+item.minutes,0);
      if(reserved+task.minutes>capacity(newDay)) throw new Error('هذا اليوم ما يكفي للمهمة. اختر موعدًا آخر أو عدّل مدتها.');
      check(await db().from('tasks').update({day:newDay,status:'deferred',manual:true}).eq('id',task.id).eq('user_id',userId).select('id').single());
    },'تأجلت المهمة لموعدك الجديد.');
    if(success) setPostponing(null);
  }
  async function reorder(task:Task,direction:-1|1) {
    const siblings=allDayTasks(task.day);
    const visible=siblings.filter(item=>item.status===task.status);
    const visibleIndex=visible.findIndex(item=>item.id===task.id);
    const target=visible[visibleIndex+direction];
    if(!target) return;
    const index=siblings.findIndex(item=>item.id===task.id);
    const swap=siblings.findIndex(item=>item.id===target.id);
    [siblings[index],siblings[swap]]=[siblings[swap],siblings[index]];
    await run(async()=>{check(await db().rpc('reorder_tasks',{p_task_ids:siblings.map(item=>item.id)}));},'انحفظ ترتيبك.');
  }
  async function source(task:Task) {
    const item=topic(task);
    const document=data.documents.find(file=>file.id===item?.document_id);
    if(!document) return;
    setSourceError('');
    setLoadingSource(task.id);
    try {
      const result=check(await db().storage.from('study-files').createSignedUrl(document.storage_path,300));
      if(!result.data?.signedUrl) throw new Error('تعذّر تجهيز رابط الملف. حاول مرة ثانية.');
      const url=result.data.signedUrl+(item?.page_start?'#page='+item.page_start:'');
      setSourceUrls(current=>({...current,[task.id]:url}));
    } catch(error) { setSourceError(errorMessage(error)); }
    finally {setLoadingSource(null);}
  }

  return <div className="stack">
    <div className="section-heading"><div><p className="eyebrow">خطوة على قد وقتك</p><h1>خطتي</h1><p className="muted">ترتيب واضح، وتعديلاتك تبقى لك.</p></div><button className="button primary" disabled={busy||!data.profile} onClick={propose}><Plus size={18}/> اقترح خطة</button></div>
    {sourceError&&<div className="notice" role="alert">{sourceError}</div>}
    {overdue.length>0 && <div className="notice"><strong>باقي {number(overdue.length)} {overdue.length===1?'مهمة من الأيام الماضية':'مهام من الأيام الماضية'}.</strong><p>تقدر تبدأ فيها، أو تختار موعدًا جديدًا لكل مهمة. اقتراح خطة جديدة يعيد توزيع المهام التلقائية بعد موافقتك.</p><button className="button ghost small" onClick={propose} disabled={busy}><RotateCcw size={16}/> اقترح إعادة توزيع</button></div>}
    {proposal && <section className="panel stack" aria-label="مراجعة الخطة المقترحة">
      <div className="section-heading"><div><p className="eyebrow">اقتراح للمراجعة</p><h2>شوفها قبل تعتمدها</h2></div><button className="button ghost small" aria-label="إغلاق الاقتراح" onClick={()=>setProposal(null)}><X size={18}/></button></div>
      <p className="muted">الأولوية للاختبار الأقرب، والمراجعة المستحقة، والجزئيات الضعيفة. عند الاعتماد تُستبدل المهام التلقائية غير المنجزة فقط؛ المهام المعدّلة يدويًا والمنجزة والمؤجلة تبقى.</p>
      {proposal.warnings.map((warning,index)=><div className="notice" key={index}>{warning}</div>)}
      {proposal.tasks.length===0?<div className="empty-state"><CalendarDays size={28}/><p>ما فيه مهام جديدة مناسبة للوقت المتاح.</p><p className="muted">راجع جزئياتك ووقت المذاكرة في الإعدادات.</p></div>:[...new Set(proposal.tasks.map(task=>task.day))].map(day=>{
        const proposed=proposal.tasks.filter(task=>task.day===day);
        const retained=data.tasks.filter(task=>task.day===day&&(task.manual||task.status!=='pending'||data.sessions.some(session=>session.task_id===task.id&&(session.status==='running'||session.status==='paused'||session.status==='completed'&&session.kind==='focus'&&!data.assessments.some(assessment=>assessment.session_id===session.id)))));
        const total=[...proposed,...retained].reduce((sum,task)=>sum+task.minutes,0);
        return <div key={day} className="stack"><div className="row"><h3>{dateLabel(day)}</h3><span className="badge">{number(total)} / {number(capacity(day))} دقيقة</span></div>{proposed.map(task=><div className="task-row" key={task.id}><div><strong>{topic(task)?.title||'جزئية غير متاحة'}</strong><p className="muted">{subject(task)?.title} · {task.kind==='review'?'مراجعة':'مذاكرة'} · {number(task.minutes)} دقيقة</p><small className="muted">{proposal.reasons[task.topic_id]}</small></div></div>)}{retained.length>0&&<small className="muted">يشمل الوقت {number(retained.length)} من مهامك المحفوظة.</small>}</div>;
      })}
      {proposal.tasks.length===0&&data.tasks.some(task=>!task.manual&&task.status==='pending')&&<div className="notice">اعتماد هذا الاقتراح الفارغ يزيل المهام التلقائية غير المنجزة من الجدول.</div>}
      {proposalSnapshot!==snapshot && <div className="notice">تغيّرت بياناتك. حدّث الاقتراح عشان تعتمد نسخة موافقة لها.</div>}
      <div className="row"><button className="button primary" disabled={busy||proposalSnapshot!==snapshot} onClick={acceptProposal}><Check size={18}/> اعتمد الخطة</button><button className="button ghost" disabled={busy} onClick={propose}><RotateCcw size={16}/> حدّث الاقتراح</button><button className="button ghost" onClick={()=>setProposal(null)}>إلغاء</button></div>
    </section>}
    <div className="row" role="group" aria-label="عرض المهام">{([['pending','المطلوب'],['done','المنجز'],['deferred','المؤجل']] as const).map(([value,label])=><button key={value} className={'button '+(filter===value?'':'ghost')} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label} <span>{number(data.tasks.filter(task=>task.status===value).length)}</span></button>)}</div>
    {filtered.length===0 && <div className="panel empty-state"><CalendarDays size={36}/><h2>{filter==='done'?'كل إنجاز يبدأ بخطوة':filter==='deferred'?'ما عندك مهام مؤجلة':'مساحة لخطتك الجاية'}</h2><p className="muted">{filter==='pending'?'أضف المواد والجزئيات من «موادي»، وحدّد وقتك في الإعدادات، ثم اطلب اقتراحًا.':filter==='done'?'المهام المكتملة بتظهر هنا.':'لو تأجلت مهمة، اختر لها موعدًا جديدًا وبتلقاها هنا.'}</p></div>}
    {days.map(day=><section className="panel stack" key={day}>
      <div className="section-heading"><div className="row"><h2>{day===today?'اليوم':dateLabel(day)}</h2>{day<today&&filter!=='done'&&<span className="badge danger">متأخر</span>}</div><span className="muted">{number(allDayTasks(day).reduce((sum,task)=>sum+task.minutes,0))} / {number(capacity(day))} دقيقة</span></div>
      {filtered.filter(task=>task.day===day).map(task=>{
        const item=topic(task);
        const siblings=allDayTasks(day).filter(sibling=>sibling.status===task.status);
        const index=siblings.findIndex(sibling=>sibling.id===task.id);
        return <article className="task-row stack" key={task.id}>
          <div className="section-heading"><div><div className="row"><h3>{item?.title||'جزئية غير متاحة'}</h3>{task.manual&&<span className="badge">تعديلك</span>}{task.kind==='review'&&<span className="badge">مراجعة</span>}</div><p className="muted">{subject(task)?.title}{item?.chapter?' · '+item.chapter:''}</p><span className="muted"><Clock3 size={14} style={{display:'inline',verticalAlign:'middle'}}/> {number(task.minutes)} دقيقة {item?.page_start?` · ص ${number(item.page_start)}${item.page_end&&item.page_end!==item.page_start?'–'+number(item.page_end):''}`:''}</span></div>{task.status!=='done'&&<button className="button primary small" disabled={busy} onClick={()=>onStart(task.topic_id,task.id)}><Play size={16}/> ابدأ</button>}</div>
          <div className="row">
            {task.status!=='done'&&<><button className="button ghost small" disabled={busy} onClick={()=>{setEditing(task.id);setDraft({day:task.day,minutes:task.minutes});setPostponing(null);}}><Pencil size={15}/> تعديل</button><button className="button ghost small" disabled={busy} onClick={()=>{setPostponing(task.id);setNewDay(addDays(task.day>today?task.day:today,1));setEditing(null);}}><CalendarDays size={15}/> تأجيل</button><button className="button ghost small" disabled={busy||index===0} onClick={()=>reorder(task,-1)} aria-label={'تقديم '+item?.title}><ArrowUp size={17}/></button><button className="button ghost small" disabled={busy||index===siblings.length-1} onClick={()=>reorder(task,1)} aria-label={'تأخير '+item?.title}><ArrowDown size={17}/></button></>}
            {item?.document_id&&<>{sourceUrls[task.id]&&<a className="button ghost small" href={sourceUrls[task.id]} target="_blank" rel="noopener noreferrer"><FileText size={15}/> افتح الملف · الرابط صالح ٥ دقائق</a>}<button className="button ghost small" disabled={loadingSource===task.id} onClick={()=>source(task)}><FileText size={15}/> {loadingSource===task.id?'نجهّز الرابط…':sourceUrls[task.id]?'جدّد الرابط':'رابط المصدر'}</button></>}
            {task.status==='deferred'&&<button className="button ghost small" disabled={busy} onClick={()=>run(async()=>{check(await db().from('tasks').update({status:'pending',manual:true}).eq('id',task.id).eq('user_id',userId).select('id').single());},'رجعت المهمة للمطلوب.')}>رجّعها للمطلوب</button>}
            <button className="button ghost small danger" disabled={busy} aria-label={'حذف مهمة '+item?.title} onClick={()=>setDeleting(task.id)}><Trash2 size={15}/></button>
          </div>
          {editing===task.id&&<form className="stack" onSubmit={event=>{event.preventDefault();void editTask(task);}}><div className="field-grid"><label className="field">اليوم<input required type="date" min={today} value={draft.day} onChange={event=>setDraft({...draft,day:event.target.value})}/></label><label className="field">المدة بالدقائق<input required type="number" min="1" max="480" value={draft.minutes} onChange={event=>setDraft({...draft,minutes:Number(event.target.value)})}/></label></div><p className="muted">المتاح في هذا اليوم: {number(capacity(draft.day))} دقيقة، شامل باقي المهام.</p><div className="row"><button className="button" disabled={busy} type="submit">احفظ التعديل</button><button className="button ghost" type="button" onClick={()=>setEditing(null)}>إلغاء</button></div></form>}
          {postponing===task.id&&<form className="stack" onSubmit={event=>{event.preventDefault();void postpone(task);}}><label className="field">متى ترجع لها؟<input required type="date" min={today} value={newDay} onChange={event=>setNewDay(event.target.value)}/></label><div className="row"><button className="button" disabled={busy} type="submit">ثبّت الموعد الجديد</button><button className="button ghost" type="button" onClick={()=>setPostponing(null)}>إلغاء</button></div></form>}
          {deleting===task.id&&<div className="notice"><p>تحذف هالمهمة من الجدول؟ الجزئية وسجل جلساتك يبقون محفوظين.</p><div className="row"><button className="button danger" disabled={busy} onClick={async()=>{const ok=await run(async()=>{check(await db().from('tasks').delete().eq('id',task.id).eq('user_id',userId).select('id').single());},'انحذفت المهمة.');if(ok)setDeleting(null);}}>نعم، احذف المهمة</button><button className="button ghost" onClick={()=>setDeleting(null)}>إلغاء</button></div></div>}
        </article>;
      })}
    </section>)}
  </div>;
}
