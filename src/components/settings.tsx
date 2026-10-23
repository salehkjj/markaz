'use client';

import { useState } from 'react';
import { Download, Plus, Save, Smartphone, X } from 'lucide-react';
import { check, db } from '@/lib/supabase';
import { fetchStudyData } from '@/lib/data';
import type { ViewProps } from '@/lib/types';

const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const colors = ['#a24232', '#526651', '#b48837', '#46566f', '#805d55'];
type Starter = { id: string; title: string; examId: string; examTitle: string; examOn: string };
const newStarter = (): Starter => ({ id: crypto.randomUUID(), title: '', examId: crypto.randomUUID(), examTitle: 'اختبار', examOn: '' });

export function Settings({ data, userId, run, busy, onDone }: ViewProps & { onDone?: () => void }) {
  const initial = data.profile;
  const [name, setName] = useState(initial?.display_name ?? '');
  const [minutes, setMinutes] = useState<string[]>(days.map((_, index) => initial ? String(initial.weekly_minutes[index] ?? 0) : ''));
  const [rest, setRest] = useState<number[]>(initial?.rest_days ?? []);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [validation, setValidation] = useState('');
  const onboarding = !initial?.onboarded;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    const incomplete = minutes.some((value, index) => !rest.includes(index) && (value.trim() === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 1440));
    if (incomplete) { setValidation('حدّد وقتك لكل يوم بالدقائق، أو علّمه يوم راحة. المدى من ٠ إلى ١٤٤٠ دقيقة.'); return; }
    if (starters.some(item => !item.title.trim())) { setValidation('اكتب اسم كل مادة أضفتها، أو احذف السطر الفارغ.'); return; }
    if (onboarding && data.subjects.length === 0 && starters.length === 0) { setValidation('أضف مادة واحدة على الأقل عشان نبدأ.'); return; }
    const ok = await run(async () => {
      if (starters.length) {
        check(await db().from('subjects').upsert(starters.map((item, index) => ({ id: item.id, user_id: userId, title: item.title.trim(), color: colors[index % colors.length] }))));
        const exams = starters.filter(item => item.examOn).map(item => ({ id: item.examId, user_id: userId, subject_id: item.id, title: item.examTitle.trim() || 'اختبار', exam_on: item.examOn, topic_ids: [] }));
        if (exams.length) check(await db().from('exams').upsert(exams));
      }
      check(await db().from('profiles').upsert({ user_id: userId, display_name: name.trim(), weekly_minutes: minutes.map((value, index) => rest.includes(index) ? 0 : Number(value)), rest_days: rest, onboarded: true }));
    }, onboarding ? 'تم الإعداد. نبدأ بالجزئيات.' : 'انحفظت إعداداتك.');
    if (ok) { setStarters([]); onDone?.(); }
  }

  async function exportData() {
    await run(async () => {
      const snapshot = await fetchStudyData(userId);
      const payload = { format: 'markaz-backup', version: 1, exported_at: new Date().toISOString(), timezone: 'Asia/Riyadh', data: {...snapshot, profile:snapshot.profile?[snapshot.profile]:[]} };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `markaz-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, 'جهّزنا نسخة بياناتك للتنزيل.');
  }

  return <div className="stack settings-view">
    <header className="section-heading"><div><p className="eyebrow">{onboarding ? 'خطوة بسيطة قبل البداية' : 'على مقاس يومك'}</p><h1>{onboarding ? 'خلّنا نرتّب البداية' : 'الإعدادات'}</h1><p className="muted">وقتك وموادك أنت تحددها. تقدر تعدّلها بأي وقت.</p></div></header>
    <form onSubmit={save} className="stack">
      <section className="panel stack">
        <h2>{onboarding ? '١. أنت وموادك' : 'بياناتك'}</h2>
        <label className="field">وش نناديك؟ <span className="muted">اختياري</span><input value={name} onChange={event => setName(event.target.value)} maxLength={80} autoComplete="given-name" placeholder="اسمك" /></label>
        {onboarding && <>
          {data.subjects.length > 0 && <p className="muted">موادك المسجلة: {data.subjects.map(subject => subject.title).join('، ')}</p>}
          {starters.map((item, index) => <div className="subject-card stack" key={item.id}>
            <div className="row"><h3>المادة {index + 1}</h3><button className="button ghost small" type="button" onClick={() => setStarters(list => list.filter(value => value.id !== item.id))} aria-label={`حذف سطر المادة ${index + 1}`}><X size={18} /></button></div>
            <label className="field">اسم المادة<input required value={item.title} maxLength={120} onChange={event => setStarters(list => list.map(value => value.id === item.id ? { ...value, title: event.target.value } : value))} placeholder="مثل: بحوث العمليات" /></label>
            <div className="field-grid">
              <label className="field">اسم الاختبار <span className="muted">اختياري</span><input value={item.examTitle} maxLength={120} onChange={event => setStarters(list => list.map(value => value.id === item.id ? { ...value, examTitle: event.target.value } : value))} /></label>
              <label className="field">موعد الاختبار <span className="muted">إذا تعرفه</span><input type="date" value={item.examOn} onChange={event => setStarters(list => list.map(value => value.id === item.id ? { ...value, examOn: event.target.value } : value))} /></label>
            </div>
          </div>)}
          <button className="button ghost" type="button" onClick={() => setStarters(list => [...list, newStarter()])}><Plus size={18} /> أضف مادة</button>
          <p className="muted">تضيف الجزئيات وملفات المادة، وتحدد نطاق الاختبار، من «موادي» بعد الإعداد.</p>
        </>}
      </section>
      <section className="panel stack">
        <div><h2>{onboarding ? '٢. وقتك وأيام الراحة' : 'وقتك خلال الأسبوع'}</h2><p className="muted">اكتب الدقائق المتاحة فعلًا. لن نملأ يومك بأكثر منها. الصفر يعني ما عندك وقت في هذا اليوم.</p></div>
        <div className="availability-grid">
          {days.map((day, index) => <div className="availability-day" key={day}>
            <label className="field" htmlFor={`minutes-${index}`}>{day}<div className="input-suffix"><input id={`minutes-${index}`} type="number" min="0" max="1440" step="1" inputMode="numeric" disabled={rest.includes(index)} value={rest.includes(index) ? '0' : minutes[index]} onChange={event => setMinutes(values => values.map((value, current) => current === index ? event.target.value : value))} placeholder="دقيقة" required={!rest.includes(index)} /><span>دقيقة</span></div></label>
            <label className="checkbox-row"><input type="checkbox" checked={rest.includes(index)} onChange={event => setRest(values => event.target.checked ? [...values, index] : values.filter(value => value !== index))} /> يوم راحة</label>
          </div>)}
        </div>
        <p className="muted">كل المواعيد والستريك حسب توقيت الرياض. تغيير الوقت المتاح لا يعيد ترتيب خطتك تلقائيًا؛ راجع «خطتي» بعدها.</p>
      </section>
      {validation && <p className="notice danger" role="alert">{validation}</p>}
      <div className="row"><button className="button primary" disabled={busy} type="submit"><Save size={18} /> {busy ? 'جارٍ الحفظ…' : onboarding ? 'احفظ ونبدأ' : 'احفظ الإعدادات'}</button></div>
    </form>
    {!onboarding && <section className="panel stack"><div className="row"><Download size={22} /><h2>نسخة من بياناتك</h2></div><p className="muted">تصدير JSON يشمل موادك وخطتك وجلساتك وتقييماتك وإعداداتك، مع بيانات الملفات. ملفات PDF نفسها تنزّلها من «موادي». التصدير نسخة للقراءة والحفظ؛ الاستيراد غير متاح في هذه النسخة.</p><div><button className="button ghost" onClick={exportData} disabled={busy}><Download size={18} /> صدّر بياناتي</button></div></section>}
    <section className="panel stack"><div className="row"><Smartphone size={22} /><h2>مركز على شاشتك الرئيسية</h2></div><p className="muted">على iPhone أو iPad: افتح الموقع في Safari، ثم مشاركة ← إضافة إلى الشاشة الرئيسية. على المتصفحات الداعمة استخدم «تثبيت التطبيق» من قائمة المتصفح.</p><p className="muted">الحفظ والمزامنة يحتاجان اتصالًا بالإنترنت. التوقيت يستعاد عند الرجوع للتطبيق؛ تنبيه الصوت بالخلفية على iOS غير مضمون.</p></section>
  </div>;
}
