'use client';
import {useState,type FormEvent} from 'react';
import {Plus} from 'lucide-react';
import {db,check} from '@/lib/supabase';
import type {ViewProps} from '@/lib/types';

export function QuickTask({data,userId,run,busy}:ViewProps){
 const [title,setTitle]=useState(''),[project,setProject]=useState(''),[due,setDue]=useState('');
 const [priority,setPriority]=useState<'low'|'normal'|'high'>('normal'),[minutes,setMinutes]=useState(25),[notes,setNotes]=useState(''),[pending,setPending]=useState('');
 async function save(event:FormEvent){event.preventDefault();const clean=title.trim();if(!clean)return;setPending(clean);
  const ok=await run(async()=>{check(await db().from('topics').insert({user_id:userId,subject_id:project||null,title:clean,mode:'work',priority,due_on:due||null,minutes,notes,work_state:'todo'}).select('id').single());},'انحفظت المهمة.');
  setPending('');if(ok){setTitle('');setDue('');setNotes('');setPriority('normal');setMinutes(25);}
 }
 return <form className="panel stack quick-task" onSubmit={event=>void save(event)} aria-label="إضافة مهمة بسرعة"><div className="section-heading"><h2>مهمة جديدة</h2><span className="muted">العنوان يكفي للبدء</span></div><label className="field">عنوان المهمة<input required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="وش تبي تنجز؟"/></label><div className="field-grid"><label className="field">المشروع <span className="muted">اختياري</span><select value={project} onChange={e=>setProject(e.target.value)}><option value="">بدون مشروع</option>{data.subjects.filter(s=>s.kind==='work'&&s.project_status!=='completed').map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label className="field">الموعد <span className="muted">اختياري</span><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label></div><details><summary>تفاصيل إضافية</summary><div className="field-grid"><label className="field">الأولوية<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="normal">عادية</option><option value="high">عالية</option><option value="low">منخفضة</option></select></label><label className="field">وقت تقديري بالدقائق<input required type="number" min="1" max="10080" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label></div><label className="field">ملاحظات<textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></details><div className="row wrap"><button className="button primary" disabled={busy||!title.trim()||minutes<1||minutes>10080}><Plus size={17}/>أضف المهمة</button>{pending&&<span role="status" className="muted">جارٍ حفظ «{pending}»…</span>}</div></form>;
}
