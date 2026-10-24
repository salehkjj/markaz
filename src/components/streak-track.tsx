import {Check,LockKeyhole,Star} from 'lucide-react';
import type {FocusSession} from '@/lib/types';
import {rewards} from '@/lib/rewards';
import {riyadhDate} from '@/lib/dates';
import {Tomato} from './tomato';
export function StreakTrack({sessions}:{sessions:FocusSession[]}) {
 const record=rewards(sessions,riyadhDate());
 return <section className="panel streak-track" aria-label="مسار الاستمرار لعشرة أيام">
 <div className="section-heading"><div><p className="eyebrow">سجل الاستمرار</p><h2>{record.current.toLocaleString('ar-SA')} <small>يوم متواصل</small></h2></div><span className="points"><Star size={15}/>{record.points.toLocaleString('ar-SA')} نقطة</span></div>
 <div className="ten-day-track">{Array.from({length:10},(_,i)=>{const day=i+1,earned=day<=record.cycle,milestone=day%5===0;return <div key={day} className={`track-day ${earned?'earned':''} ${milestone?'milestone':''}`} aria-label={`اليوم ${day}، ${earned?'مكتمل':'لم يكتمل'}${milestone?'، مكافأة ٢٥ نقطة':''}`}><div className="day-mark">{milestone?<><Tomato/>{!earned&&<LockKeyhole className="tomato-lock" size={14}/>}</>:earned?<Check size={16}/>:<span className="day-dot"/>}</div><small>{day.toLocaleString('ar-SA')}</small></div>})}</div>
 <p className="track-caption">١٠ نقاط لكل يوم تركيز · طماطة تنفتح و٢٥ نقطة إضافية كل ٥ أيام متواصلة</p>
 <details className="reward-details"><summary>كيف يُحسب الاستمرار؟</summary><p>جلسة تركيز مكتملة تكفي لليوم بتوقيت الرياض. الراحة والجلسات الملغاة لا تُحتسب. يبدأ المسار من جديد بعد ١٠ أيام أو انقطاع يوم، وتبقى نقاطك السابقة. النقاط تشجيعية بلا قيمة مالية.</p></details>
 </section>;
}
