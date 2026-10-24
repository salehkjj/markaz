'use client';

import { useRef, useState } from 'react';
import { BookOpen, CalendarDays, Check, ChevronLeft, ExternalLink, FileText, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { check, db } from '@/lib/supabase';
import { extractPdf, validatePdfFile } from '@/lib/pdf';
import type { Exam, StudyDocument, Subject, Topic, ViewProps } from '@/lib/types';

type TopicDraft = { id: string; title: string; chapter: string; minutes: number; document_id: string; page_start: string; page_end: string; notes: string; completed: boolean };
type ExamDraft = { id: string; title: string; exam_on: string; topic_ids: string[] };
type Suggestion = { id: string; title: string; chapter: string; minutes: number; page_start: number; page_end: number };
type PdfDraft = { document: StudyDocument; suggestions: Suggestion[]; warnings: string[]; textPages: Array<{ page: number; text: string }> };
const blankTopic = (): TopicDraft => ({ id: crypto.randomUUID(), title: '', chapter: '', minutes: 25, document_id: '', page_start: '', page_end: '', notes: '', completed: false });
const emptyExam = (): ExamDraft => ({ id: crypto.randomUUID(), title: '', exam_on: '', topic_ids: [] });
const colors = ['#a24232', '#526651', '#b48837', '#46566f', '#805d55'];
const understandingLabel = { understood: 'فاهم — تقييمك', review: 'تحتاج رجعة', unclear: 'مو واضحة' };

export function Materials({ data, userId, run, busy }: ViewProps) {
  const [selectedId, setSelectedId] = useState('');
  const [subjectDraft, setSubjectDraft] = useState<{ id: string; title: string; color: string } | null>(null);
  const [topicDraft, setTopicDraft] = useState<TopicDraft | null>(null);
  const [examDraft, setExamDraft] = useState<ExamDraft | null>(null);
  const [pdfDraft, setPdfDraft] = useState<PdfDraft | null>(null);
  const [search, setSearch] = useState('');
  const [validation, setValidation] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const studySubjects = data.subjects.filter(subject => subject.kind === 'study');
  const selected = studySubjects.find(subject => subject.id === selectedId) ?? studySubjects[0];
  const topics = data.topics.filter(topic => topic.subject_id === selected?.id);
  const documents = data.documents.filter(document => document.subject_id === selected?.id);
  const exams = data.exams.filter(exam => exam.subject_id === selected?.id).sort((a, b) => a.exam_on.localeCompare(b.exam_on));
  const filtered = topics.filter(topic => `${topic.title} ${topic.chapter}`.includes(search));
  const locked = busy || Boolean(uploadStage);

  function selectSubject(subject: Subject) {
    setSelectedId(subject.id);
    setTopicDraft(null);
    setExamDraft(null);
    setPdfDraft(null);
    setValidation('');
    setSearch('');
    setShowUpload(false);
  }

  async function saveSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subjectDraft?.title.trim()) return;
    const id = subjectDraft.id;
    const ok = await run(async () => { check(await db().from('subjects').upsert({ ...subjectDraft, title: subjectDraft.title.trim(), user_id: userId })); }, 'حُفظ المشروع.');
    if (ok) { setSubjectDraft(null); setSelectedId(id); }
  }

  async function deleteSubject(subject: Subject) {
    if (!window.confirm(`تحذف مادة «${subject.title}» ومهامها ومواعيدها وملفاتها ومهامها؟ هذا الحذف نهائي. تبقى الجلسات السابقة في سجل إنجازك.`)) return;
    const ok = await run(async () => {
      const paths = data.documents.filter(document => document.subject_id === subject.id).map(document => document.storage_path);
      if (paths.length) check(await db().storage.from('study-files').remove(paths));
      check(await db().from('subjects').delete().eq('id', subject.id).eq('user_id', userId));
    }, 'حُذف المشروع.');
    if (ok) { setSelectedId(''); setTopicDraft(null); setExamDraft(null); setPdfDraft(null); }
  }

  function editTopic(topic: Topic) {
    setValidation('');
    setTopicDraft({ id: topic.id, title: topic.title, chapter: topic.chapter, minutes: topic.minutes, document_id: topic.document_id ?? '', page_start: String(topic.page_start ?? ''), page_end: String(topic.page_end ?? ''), notes: topic.notes, completed: topic.completed });
  }

  async function saveTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topicDraft || !selected) return;
    setValidation('');
    const start = topicDraft.page_start ? Number(topicDraft.page_start) : null;
    const end = topicDraft.page_end ? Number(topicDraft.page_end) : start;
    const doc = documents.find(document => document.id === topicDraft.document_id);
    if (!topicDraft.title.trim() || !Number.isInteger(topicDraft.minutes) || topicDraft.minutes < 1 || topicDraft.minutes > 10080) { setValidation('اكتب عنوان المهمة ومدة صحيحة من دقيقة إلى ١٠٠٨٠ دقيقة.'); return; }
    if ((start !== null && (!Number.isInteger(start) || start < 1)) || (end !== null && (!Number.isInteger(end) || end < (start ?? 1))) || (!start && end) || (doc?.pages && end && end > doc.pages)) { setValidation('راجع نطاق الصفحات: البداية قبل النهاية، وداخل عدد صفحات الملف.'); return; }
    const payload = { id: topicDraft.id, user_id: userId, subject_id: selected.id, title: topicDraft.title.trim(), chapter: topicDraft.chapter.trim(), minutes: topicDraft.minutes, document_id: topicDraft.document_id || null, page_start: start, page_end: end, notes: topicDraft.notes.trim(), completed: topicDraft.completed };
    const ok = await run(async () => { check(await db().from('topics').upsert(payload)); }, 'انحفظت المهمة.');
    if (ok) setTopicDraft(null);
  }

  async function deleteTopic(topic: Topic) {
    if (!window.confirm(`تحذف مهمة «${topic.title}» ومهامها من الخطة؟ تبقى جلساتك السابقة في السجل.`)) return;
    await run(async () => { check(await db().from('topics').delete().eq('id', topic.id).eq('user_id', userId)); }, 'انحذفت المهمة.');
  }

  async function saveExam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!examDraft || !selected || !examDraft.title.trim() || !examDraft.exam_on) return;
    const ok = await run(async () => { check(await db().from('exams').upsert({ ...examDraft, title: examDraft.title.trim(), subject_id: selected.id, user_id: userId })); }, 'انحفظ موعد التسليم ونطاقه.');
    if (ok) setExamDraft(null);
  }

  async function deleteExam(exam: Exam) {
    if (!window.confirm(`تحذف موعد «${exam.title}»؟`)) return;
    await run(async () => { check(await db().from('exams').delete().eq('id', exam.id).eq('user_id', userId)); }, 'انحذف الموعد.');
  }

  async function uploadPdf(file: File) {
    if (!selected) return;
    setValidation('');
    try { validatePdfFile(file); } catch (error) { setValidation(error instanceof Error ? error.message : 'تعذّر فتح الملف.'); return; }
    const document: StudyDocument = { id: crypto.randomUUID(), user_id: userId, subject_id: selected.id, name: file.name, storage_path: `${userId}/${crypto.randomUUID()}.pdf`, pages: null };
    setPdfDraft(null);
    setUploadStage('جارٍ رفع الملف إلى مساحتك الخاصة…');
    try {
      await run(async () => {
        check(await db().storage.from('study-files').upload(document.storage_path, file, { contentType: 'application/pdf', upsert: false }));
        const saved = await db().from('documents').insert(document);
        if (saved.error) {
          const cleanup = await db().storage.from('study-files').remove([document.storage_path]);
          if (cleanup.error) throw new Error('تعذّر تسجيل الملف وتنظيف النسخة المرفوعة. راجع مساحة study-files في Supabase قبل المحاولة مجددًا.');
          throw saved.error;
        }
        setUploadStage('انحفظ الملف. جارٍ استخراج النص والعناوين من صفحاته…');
        try {
          const result = await extractPdf(file);
          const updated = await db().from('documents').update({ pages: result.pages }).eq('id', document.id).eq('user_id', userId);
          const warnings = [...result.warnings];
          if (updated.error) warnings.push('استخرجنا النص، لكن تعذّر حفظ عدد الصفحات. الملف نفسه محفوظ.');
          setPdfDraft({ document: { ...document, pages: result.pages }, suggestions: result.suggestions.map(suggestion => ({ ...suggestion, id: crypto.randomUUID() })), warnings, textPages: result.textPages });
        } catch (error) {
          setPdfDraft({ document, suggestions: [], warnings: [error instanceof Error ? error.message : 'ما قدرنا نقرأ النص من هذا الملف. أضف المهام يدويًا واربطها بصفحاته.'], textPages: [] });
        }
      }, 'انحفظ الملف في حسابك. راجع نتيجة القراءة أدناه.');
    } finally {
      setUploadStage('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function approveSuggestions() {
    if (!pdfDraft || !pdfDraft.suggestions.length) return;
    setValidation('');
    const valid = pdfDraft.suggestions.every(suggestion => suggestion.title.trim() && Number.isInteger(suggestion.minutes) && suggestion.minutes > 0 && suggestion.minutes <= 10080 && Number.isInteger(suggestion.page_start) && Number.isInteger(suggestion.page_end) && suggestion.page_start > 0 && suggestion.page_end >= suggestion.page_start && (!pdfDraft.document.pages || suggestion.page_end <= pdfDraft.document.pages));
    if (!valid) { setValidation('راجع العناوين والمدد ونطاق الصفحات قبل اعتماد التقسيم.'); return; }
    const ok = await run(async () => {
      check(await db().from('topics').upsert(pdfDraft.suggestions.map(suggestion => ({ ...suggestion, title: suggestion.title.trim(), chapter: suggestion.chapter.trim(), user_id: userId, subject_id: pdfDraft.document.subject_id, document_id: pdfDraft.document.id, completed: false }))));
    }, 'أضفنا المهام. تقدر تقترح لها جدولًا من «خطتي».');
    if (ok) setPdfDraft(null);
  }

  async function openDocument(document: StudyDocument, page?: number | null) {
    const opened = window.open('about:blank', '_blank');
    if (opened) opened.opener = null;
    const ok = await run(async () => {
      const result = check(await db().storage.from('study-files').createSignedUrl(document.storage_path, 300));
      if (!result.data?.signedUrl) throw new Error('تعذّر إنشاء رابط خاص للملف.');
      const url = `${result.data.signedUrl}${page ? `#page=${page}` : ''}`;
      if (opened) opened.location.href = url;
      else window.location.assign(url);
    });
    if (!ok) opened?.close();
  }

  async function reextractDocument(document: StudyDocument) {
    setUploadStage('نقرأ الملف المحفوظ ونجهّز تقسيمًا للمراجعة…');
    try {
      await run(async () => {
        const result = check(await db().storage.from('study-files').download(document.storage_path));
        if (!result.data) throw new Error('تعذّر تنزيل الملف الخاص.');
        const file = new File([result.data], document.name, { type: 'application/pdf' });
        try {
          const extraction = await extractPdf(file);
          check(await db().from('documents').update({ pages: extraction.pages }).eq('id', document.id).eq('user_id', userId));
          setPdfDraft({ document: { ...document, pages: extraction.pages }, suggestions: extraction.suggestions.map(suggestion => ({ ...suggestion, id: crypto.randomUUID() })), warnings: extraction.warnings, textPages: extraction.textPages });
        } catch (error) {
          setPdfDraft({ document, suggestions: [], warnings: [error instanceof Error ? error.message : 'ما قدرنا نقرأ نص الملف. أضف المهام يدويًا.'], textPages: [] });
        }
      }, 'نتيجة القراءة جاهزة. راجعها قبل اعتماد المهام.');
    } finally { setUploadStage(''); }
  }

  async function deleteDocument(document: StudyDocument) {
    if (!window.confirm(`تحذف ملف «${document.name}» نهائيًا؟ ستبقى مهامه بدون رابط الملف.`)) return;
    const ok = await run(async () => {
      check(await db().storage.from('study-files').remove([document.storage_path]));
      check(await db().from('documents').delete().eq('id', document.id).eq('user_id', userId));
    }, 'انحذف الملف.');
    if (ok && pdfDraft?.document.id === document.id) setPdfDraft(null);
  }

  function updateSuggestion(id: string, patch: Partial<Suggestion>) {
    setPdfDraft(current => current ? { ...current, suggestions: current.suggestions.map(suggestion => suggestion.id === id ? { ...suggestion, ...patch } : suggestion) } : null);
  }

  return <div className="stack materials-view">
    <header className="section-heading"><div><p className="eyebrow">مساحة الدراسة</p><h1>مواد الدراسة</h1><p className="muted"></p></div><button className="button primary" disabled={locked} onClick={() => setSubjectDraft({ id: crypto.randomUUID(), title: '', color: colors[studySubjects.length % colors.length] })}><Plus size={18} /> مادة جديدة</button></header>

    {subjectDraft && <form className="panel stack" onSubmit={saveSubject}><div className="row"><h2>{data.subjects.some(subject => subject.id === subjectDraft.id) ? 'تعديل المادة' : 'مادة جديدة'}</h2><button type="button" className="button ghost small" onClick={() => setSubjectDraft(null)} aria-label="إغلاق إضافة المشروع"><X size={18} /></button></div><label className="field">اسم المادة<input autoFocus required maxLength={120} value={subjectDraft.title} onChange={event => setSubjectDraft({ ...subjectDraft, title: event.target.value })} placeholder="مثل: بحوث العمليات أو الإحصاء" /></label><fieldset className="color-picker"><legend>لون المشروع</legend><div className="row">{colors.map(color => <label key={color} className="color-option" style={{ backgroundColor: color }}><input type="radio" name="subject-color" checked={subjectDraft.color === color} onChange={() => setSubjectDraft({ ...subjectDraft, color })} aria-label={`لون ${colors.indexOf(color) + 1}`} />{subjectDraft.color === color && <Check size={16} />}</label>)}</div></fieldset><div className="row"><button type="submit" className="button primary" disabled={locked}>حفظ</button><button type="button" className="button ghost" onClick={() => setSubjectDraft(null)}>إلغاء</button></div></form>}

    {!studySubjects.length ? <section className="panel empty-state"><BookOpen size={36} /><h2>ابدأ بمادة</h2><p className="muted">أضف المهام يدويًا أو ارفع ملف PDF.</p></section> : <>
      <nav className="subject-tabs" aria-label="اختيار المشروع">{studySubjects.map(subject => <button key={subject.id} className={`subject-tab ${selected?.id === subject.id ? 'active' : ''}`} disabled={locked} onClick={() => selectSubject(subject)} aria-pressed={selected?.id === subject.id}><span className="subject-dot" style={{ backgroundColor: subject.color }} /><span>{subject.title}</span><span className="badge">{data.topics.filter(topic => topic.subject_id === subject.id).length}</span></button>)}</nav>
      {selected && <section className="panel stack">
        <div className="section-heading"><div><p className="eyebrow">دفتر المشروع</p><h2>{selected.title}</h2><p className="muted">{topics.length} مهمة · {topics.filter(topic => topic.completed).length} منجزة · {documents.length} ملف</p></div><div className="row"><button className="button ghost small" disabled={locked} onClick={() => setSubjectDraft({ id: selected.id, title: selected.title, color: selected.color })}><Pencil size={16} /> تعديل</button><button className="button ghost small danger" disabled={locked} onClick={() => deleteSubject(selected)} aria-label={`حذف مادة ${selected.title}`}><Trash2 size={16} /></button></div></div>
        <div className="row wrap"><button className="button" disabled={locked} onClick={() => { setTopicDraft(blankTopic()); setValidation(''); }}><Plus size={18} /> أضف مهمة</button><button className="button ghost" disabled={locked} onClick={() => { setShowUpload(value => !value); setValidation(''); }}><Upload size={18} /> ارفع PDF</button><button className="button ghost" disabled={locked} onClick={() => setExamDraft(emptyExam())}><CalendarDays size={18} /> أضف موعدًا</button></div>
      </section>}

      {validation && <p className="notice danger" role="alert">{validation}</p>}

      {topicDraft && <form className="panel stack" onSubmit={saveTopic}>
        <div className="row"><h2>{topics.some(topic => topic.id === topicDraft.id) ? 'تعديل المهمة' : 'مهمة جديدة'}</h2><button type="button" className="button ghost small" onClick={() => setTopicDraft(null)} aria-label="إغلاق محرر المهمة"><X size={18} /></button></div>
        <label className="field">عنوان المهمة<input required autoFocus maxLength={240} value={topicDraft.title} onChange={event => setTopicDraft({ ...topicDraft, title: event.target.value })} placeholder="عنوان محدد تعرف تبدأ منه" /></label>
        <div className="field-grid"><label className="field">المجموعة <span className="muted">اختياري</span><input maxLength={240} value={topicDraft.chapter} onChange={event => setTopicDraft({ ...topicDraft, chapter: event.target.value })} /></label><label className="field">الوقت المتوقع بالدقائق<input required type="number" min="1" max="10080" inputMode="numeric" value={topicDraft.minutes || ''} onChange={event => setTopicDraft({ ...topicDraft, minutes: Number(event.target.value) })} /></label></div>
        <label className="field">الملف المرتبط<select value={topicDraft.document_id} onChange={event => setTopicDraft({ ...topicDraft, document_id: event.target.value })}><option value="">بدون ملف</option>{documents.map(document => <option key={document.id} value={document.id}>{document.name}</option>)}</select></label>
        <div className="field-grid"><label className="field">من صفحة <span className="muted">اختياري</span><input type="number" min="1" inputMode="numeric" value={topicDraft.page_start} onChange={event => setTopicDraft({ ...topicDraft, page_start: event.target.value })} /></label><label className="field">إلى صفحة<input type="number" min="1" inputMode="numeric" value={topicDraft.page_end} onChange={event => setTopicDraft({ ...topicDraft, page_end: event.target.value })} /></label></div>
        <label className="field">ملاحظة قصيرة<textarea rows={2} maxLength={2000} value={topicDraft.notes} onChange={event => setTopicDraft({ ...topicDraft, notes: event.target.value })} placeholder="أي نقطة تحتاج انتباهك؟" /></label>
        <label className="checkbox-row"><input type="checkbox" checked={topicDraft.completed} onChange={event => setTopicDraft({ ...topicDraft, completed: event.target.checked })} /> انتهيت من مذاكرة المهمة</label><p className="muted">إنجاز المذاكرة يختلف عن الفهم. تقييمك ودليل حل السؤال يظهران بشكل مستقل.</p>
        <div className="row"><button className="button primary" type="submit" disabled={locked}>احفظ المهمة</button><button className="button ghost" type="button" onClick={() => setTopicDraft(null)}>إلغاء</button></div>
      </form>}

      {showUpload && <section className="panel stack"><div><h2>من الملف إلى مهام واضحة</h2><p className="muted">PDF حتى ٢٠ ميغابايت. راجع المهام المستخرجة قبل اعتمادها. </p></div><label className="upload-area"><Upload size={28} /><strong>اختر ملف المشروع</strong><span className="muted">يرتبط بمشروع «{selected?.title}» ويُحفظ في مساحة خاصة.</span><input ref={fileRef} type="file" accept="application/pdf,.pdf" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadPdf(file); }} /></label>{uploadStage && <p role="status" className="notice">{uploadStage}</p>}</section>}

      {pdfDraft && <section className="panel stack pdf-review">
        <div className="section-heading"><div><p className="eyebrow">راجع، عدّل، ثم اعتمد</p><h2>تقسيم «{pdfDraft.document.name}»</h2><p className="muted">{pdfDraft.document.pages ? `${pdfDraft.document.pages} صفحة · ` : ''}لم نضف أي مهمة إلى الخطة بعد.</p></div><button className="button ghost small" disabled={locked} onClick={() => setPdfDraft(null)} aria-label="إغلاق مراجعة التقسيم"><X size={18} /></button></div>
        {pdfDraft.warnings.map((warning, index) => <p className="notice" key={index}>{warning}</p>)}
        {!pdfDraft.suggestions.length && <div className="empty-state"><FileText size={28} /><h3>أضف التقسيم يدويًا</h3><p className="muted">الملف محفوظ. إذا كان مصورًا أو ما كانت عناوينه واضحة، تقدر تكتب المهام وتربطها بصفحاته.</p><button className="button" disabled={locked} onClick={() => setTopicDraft({ ...blankTopic(), document_id: pdfDraft.document.id })}><Plus size={18} /> أضف مهمة من هذا الملف</button></div>}
        {pdfDraft.suggestions.map((suggestion, index) => <div className="suggestion-card stack" key={suggestion.id}><div className="row"><span className="badge">المهمة {index + 1}</span><button className="button ghost small danger" disabled={locked} onClick={() => setPdfDraft(current => current ? { ...current, suggestions: current.suggestions.filter(item => item.id !== suggestion.id) } : null)} aria-label={`استبعاد الاقتراح ${index + 1}`}><Trash2 size={16} /></button></div><label className="field">العنوان<input maxLength={240} value={suggestion.title} onChange={event => updateSuggestion(suggestion.id, { title: event.target.value })} /></label><div className="field-grid"><label className="field">المجموعة<input maxLength={240} value={suggestion.chapter} onChange={event => updateSuggestion(suggestion.id, { chapter: event.target.value })} placeholder="اختياري — اكتبه من المصدر" /></label><label className="field">الدقائق المتوقعة<input type="number" min="1" max="10080" inputMode="numeric" value={suggestion.minutes || ''} onChange={event => updateSuggestion(suggestion.id, { minutes: Number(event.target.value) })} /></label></div><div className="field-grid"><label className="field">من صفحة<input type="number" min="1" max={pdfDraft.document.pages ?? undefined} value={suggestion.page_start || ''} onChange={event => updateSuggestion(suggestion.id, { page_start: Number(event.target.value) })} /></label><label className="field">إلى صفحة<input type="number" min="1" max={pdfDraft.document.pages ?? undefined} value={suggestion.page_end || ''} onChange={event => updateSuggestion(suggestion.id, { page_end: Number(event.target.value) })} /></label></div></div>)}
        {pdfDraft.textPages.length > 0 && <details><summary>اعرض النص المستخرج للتحقق</summary><div className="pdf-text-preview">{pdfDraft.textPages.map(page => <section key={page.page}><h3>صفحة {page.page}</h3><pre dir="auto">{page.text || 'ما ظهر نص قابل للاستخراج في هذه الصفحة.'}</pre></section>)}</div></details>}
        {pdfDraft.suggestions.length > 0 && <div className="row wrap"><button className="button primary" disabled={locked} onClick={approveSuggestions}><Check size={18} /> اعتمد {pdfDraft.suggestions.length} مهمة</button><button className="button ghost" disabled={locked} onClick={() => setPdfDraft(current => current ? { ...current, suggestions: [...current.suggestions, { id: crypto.randomUUID(), title: '', chapter: '', minutes: 25, page_start: 1, page_end: 1 }] } : null)}><Plus size={18} /> أضف للتقسيم</button></div>}
      </section>}

      {examDraft && <form className="panel stack" onSubmit={saveExam}><div className="row"><h2>{exams.some(exam => exam.id === examDraft.id) ? 'تعديل التسليم' : 'موعد جديد'}</h2><button type="button" className="button ghost small" onClick={() => setExamDraft(null)} aria-label="إغلاق محرر التسليم"><X size={18} /></button></div><div className="field-grid"><label className="field">عنوان الموعد<input autoFocus required maxLength={120} value={examDraft.title} onChange={event => setExamDraft({ ...examDraft, title: event.target.value })} placeholder="مثل: تسليم التقرير" /></label><label className="field">الموعد<input required type="date" value={examDraft.exam_on} onChange={event => setExamDraft({ ...examDraft, exam_on: event.target.value })} /></label></div><fieldset className="stack"><legend>المهام الداخلة في التسليم</legend><p className="muted">بدون تحديد يعني كل مهام المشروع. اختر مهام محددة إذا النطاق معروف.</p>{topics.length ? topics.map(topic => <label className="checkbox-row" key={topic.id}><input type="checkbox" checked={examDraft.topic_ids.includes(topic.id)} onChange={event => setExamDraft({ ...examDraft, topic_ids: event.target.checked ? [...examDraft.topic_ids, topic.id] : examDraft.topic_ids.filter(id => id !== topic.id) })} /><span>{topic.title}</span></label>) : <p className="muted">ما فيه مهام بعد. تقدر تحدد النطاق بعد إضافتها.</p>}</fieldset><div className="row"><button className="button primary" disabled={locked} type="submit">احفظ التسليم</button><button className="button ghost" type="button" onClick={() => setExamDraft(null)}>إلغاء</button></div></form>}

      <section className="panel stack"><div className="section-heading"><h2>مهام المشروع</h2>{topics.length > 0 && <label className="search-field"><Search size={17} /><input aria-label="ابحث في مهام المشروع" value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث عن مهمة" /></label>}</div>
        {!topics.length ? <div className="empty-state"><BookOpen size={30} /><h3>وش المطلوب في هالمشروع؟</h3><p className="muted">أضف مهمة محددة، أو ارفع ملف المشروع وراجع تقسيمه.</p></div> : !filtered.length ? <p className="muted">ما لقينا مهمة بهذا البحث.</p> : <div className="stack topic-list">{filtered.map(topic => {
          const document = documents.find(item => item.id === topic.document_id);
          return <article className="topic-row" key={topic.id}><div className="topic-content">{topic.chapter && <p className="eyebrow">{topic.chapter}</p>}<h3>{topic.title}</h3><div className="row wrap topic-meta"><span className="muted">{topic.minutes} دقيقة</span><span className={`badge ${topic.completed ? 'success' : ''}`}>{topic.completed ? 'منجزة' : 'باقي تذاكرها'}</span>{topic.understanding && <span className="badge">{understandingLabel[topic.understanding]}</span>}{topic.evidence === 'yes' && <span className="badge">حلّيت بدون الرجوع للحل</span>}{topic.evidence === 'no' && <span className="badge">الحل يحتاج تدريب</span>}</div>{topic.notes && <p className="muted topic-note">{topic.notes}</p>}{document && <button className="text-link" disabled={locked} onClick={() => openDocument(document, topic.page_start)}><FileText size={15} />{document.name}{topic.page_start ? ` · ص ${topic.page_start}${topic.page_end && topic.page_end !== topic.page_start ? `–${topic.page_end}` : ''}` : ''}<ExternalLink size={14} /></button>}</div><div className="row topic-actions"><button className="button ghost small" disabled={locked} onClick={() => editTopic(topic)} aria-label={`تعديل ${topic.title}`}><Pencil size={16} /></button><button className="button ghost small danger" disabled={locked} onClick={() => deleteTopic(topic)} aria-label={`حذف ${topic.title}`}><Trash2 size={16} /></button></div></article>;
        })}</div>}
      </section>

      <div className="material-bottom-grid"><section className="panel stack"><div className="row"><CalendarDays size={21} /><h2>التسليمات</h2></div>{!exams.length ? <p className="muted">ما فيه موعد مسجل. أضفه متى ما عرفته.</p> : exams.map(exam => <article className="exam-row" key={exam.id}><div><h3>{exam.title}</h3><time dateTime={exam.exam_on}>{new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', calendar: 'gregory', timeZone: 'Asia/Riyadh' }).format(new Date(`${exam.exam_on}T12:00:00+03:00`))}</time><p className="muted">{exam.topic_ids.length ? `${exam.topic_ids.length} مهمة محددة` : 'كل مهام المشروع'}</p></div><div className="row"><button className="button ghost small" disabled={locked} aria-label={`تعديل ${exam.title}`} onClick={() => setExamDraft({ id: exam.id, title: exam.title, exam_on: exam.exam_on, topic_ids: [...exam.topic_ids] })}><Pencil size={16} /></button><button className="button ghost small danger" disabled={locked} aria-label={`حذف ${exam.title}`} onClick={() => deleteExam(exam)}><Trash2 size={16} /></button></div></article>)}</section>
      <section className="panel stack"><div className="row"><FileText size={21} /><h2>ملفات المشروع</h2></div>{!documents.length ? <p className="muted">ملفاتك تظهر هنا بعد رفعها.</p> : documents.map(document => <article className="document-row" key={document.id}><button className="document-link" disabled={locked} onClick={() => openDocument(document)}><FileText size={20} /><span>{document.name}<small className="muted">{document.pages ? `${document.pages} صفحة` : 'PDF'} · ملف خاص</small></span><ChevronLeft size={17} /></button><div className="row"><button className="button ghost small" disabled={locked} onClick={() => void reextractDocument(document)}>اقترح تقسيم</button><button className="button ghost small danger" disabled={locked} aria-label={`حذف ملف ${document.name}`} onClick={() => deleteDocument(document)}><Trash2 size={16} /></button></div></article>)}<p className="muted">روابط الملفات خاصة ومؤقتة. لا تشارك الرابط مع غيرك.</p></section></div>
    </>}
  </div>;
}
