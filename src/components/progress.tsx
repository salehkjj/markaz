'use client';

import { BookOpen, Check, Star, Timer } from 'lucide-react';
import {StreakTrack} from './streak-track';
import { riyadhDate } from '@/lib/dates';
import type { ViewProps } from '@/lib/types';

const number=(value:number)=>value.toLocaleString('ar-SA');
const understanding={understood:'فاهم',review:'يحتاج مراجعة',unclear:'مو واضح'};
const evidence={yes:'قدرت تحل بدون الرجوع للحل',no:'ما قدرت تحل بدون الرجوع للحل',untried:'ما جربت تحل'};
const formatDay=(day:string)=>new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'short',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(day+'T12:00:00+03:00'));

export function Progress({data}:ViewProps) {
  const complete=data.sessions.filter(session=>session.kind==='focus'&&session.status==='completed'&&session.completed_at);
  const completedTasks=data.tasks.filter(task=>task.status==='done').length;
  const selfUnderstood=data.topics.filter(topic=>topic.understanding==='understood').length;
  const solved=data.topics.filter(topic=>topic.evidence==='yes').length;
  const needsReview=data.topics.filter(topic=>topic.understanding==='review'||topic.understanding==='unclear'||topic.evidence==='no');
  const sessions=[...complete].sort((a,b)=>(b.completed_at||'').localeCompare(a.completed_at||''));
  const percent=(count:number,total:number)=>total?Math.round(count/total*100):0;
  return <div className="stack">
    <div className="section-heading"><div><p className="eyebrow">أثر الخطوات الصغيرة</p><h1>إنجازي</h1></div><Star size={32} color="var(--gold, #a67e32)"/></div>
    <StreakTrack sessions={data.sessions}/>
    <div className="field-grid">
      <section className="panel stack"><BookOpen size={24}/><h2>إنجاز المهام</h2><strong style={{fontSize:'2rem'}}>{number(completedTasks)} <span className="muted" style={{fontSize:'1rem'}}>من {number(data.tasks.length)}</span></strong><progress aria-label="نسبة المهام المنجزة" max="100" value={percent(completedTasks,data.tasks.length)} style={{width:'100%',accentColor:'var(--navy, #182637)'}}/><p className="muted">الإنجاز مستقل عن تقييم الفهم.</p></section>
      <section className="panel stack"><Check size={24}/><h2>فهمك وحلّك</h2><div><strong>{number(selfUnderstood)}</strong> جزئية قيّمت فهمك لها بـ«فاهم».</div><div><strong>{number(solved)}</strong> جزئية سجّلت أنك حليت فيها بدون الرجوع للحل.</div><p className="muted">تقييم ذاتي، وليس اختبارًا للفهم.</p></section>
    </div>
    {needsReview.length>0&&<section className="panel stack"><div className="section-heading"><h2>هذي تحتاج رجعة</h2><span className="badge">{number(needsReview.length)} جزئية</span></div>{needsReview.map(topic=><div className="topic-row" key={topic.id}><strong>{topic.title}</strong><p className="muted">{data.subjects.find(subject=>subject.id===topic.subject_id)?.title} · {topic.understanding?understanding[topic.understanding]:'ما قيّمت فهمك بعد'}{topic.evidence==='no'?' · الحل يحتاج تدريب':''}{topic.review_on?' · مراجعة '+formatDay(topic.review_on):''}</p>{topic.notes&&<p>{topic.notes}</p>}</div>)}</section>}
    <section className="panel stack"><div className="section-heading"><h2>سجل التركيز</h2><span className="badge"><Timer size={15}/> {number(Math.floor(complete.reduce((sum,session)=>sum+session.duration_seconds,0)/60))} دقيقة مكتملة</span></div>{sessions.length===0?<div className="empty-state"><Timer size={32}/><h3>طماطة وحدة وتبدأ</h3><p className="muted">الجلسات المكتملة وتقييمك بعدها بتظهر هنا.</p></div>:sessions.slice(0,50).map(session=>{
      const topic=data.topics.find(item=>item.id===session.topic_id);
      const assessment=data.assessments.find(item=>item.session_id===session.id);
      return <article className="task-row stack" key={session.id}><div className="section-heading"><div><strong>{topic?.title||'جلسة حرة'}</strong><p className="muted">{topic?data.subjects.find(subject=>subject.id===topic.subject_id)?.title+' · ':''}{formatDay(riyadhDate(session.completed_at!))}</p></div><span className="badge">{number(Math.floor(session.duration_seconds/60))} دقيقة</span></div>{assessment?<div><div className="row"><span className="badge">{understanding[assessment.understanding]}</span><span className="muted">{evidence[assessment.evidence]}</span></div>{assessment.note&&<p>{assessment.note}</p>}</div>:<p className="muted">اكتملت الجلسة، وتقييم الفهم ما تسجّل بعد.</p>}</article>;
    })}{sessions.length>50&&<p className="muted">هنا آخر ٥٠ جلسة. سجلّك كاملًا متاح في تصدير البيانات من الإعدادات.</p>}</section>
  </div>;
}
