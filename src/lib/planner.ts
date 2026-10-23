import { addDays, daysUntil, weekday } from './dates';
import type { Exam, StudyData, Task, Topic } from './types';

export interface PlanProposal {
  /** New automatic tasks only. Retained user-edited and completed tasks are not returned. */
  tasks: Task[];
  warnings: string[];
  /** Human-readable selection reason, indexed by topic id. */
  reasons: Record<string, string>;
}

const HORIZON_DAYS = 30;
const CHUNK_MINUTES = 25;

function nextExam(topic: Topic, exams: Exam[], today: string): Exam | undefined {
  return exams
    .filter(exam => exam.subject_id === topic.subject_id && exam.exam_on >= today &&
      (exam.topic_ids.length === 0 || exam.topic_ids.includes(topic.id)))
    .sort((a, b) => a.exam_on.localeCompare(b.exam_on))[0];
}

function integerMinutes(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Deterministic priority and allocation, with no external model or inferred hours.
 * The database validates capacity again when the user accepts the proposal.
 * An exam day is conservatively unavailable because no exam time is requested.
 */
export function proposePlan(data: StudyData, today: string): PlanProposal {
  const proposal: PlanProposal = { tasks: [], warnings: [], reasons: {} };
  const profile = data.profile;
  if (!profile || !profile.onboarded) {
    proposal.warnings.push('حدد وقتك المتاح وأيام راحتك أولًا، ثم نرتب الخطة.');
    return proposal;
  }
  const days = Array.from({ length: HORIZON_DAYS }, (_, index) => addDays(today, index));
  const capacities = new Map(days.map(day => [day, profile.rest_days.includes(weekday(day))
    ? 0 : integerMinutes(profile.weekly_minutes[weekday(day)] ?? 0)]));
  const remaining = new Map(capacities);
  // replace_plan keeps work in a live session or completed session awaiting assessment.
  const activeTaskIds = new Set(data.sessions
    .filter(session => session.status === 'running' || session.status === 'paused' ||
      (session.status === 'completed' && session.kind === 'focus' && !data.assessments.some(assessment => assessment.session_id === session.id)))
    .map(session => session.task_id).filter(Boolean));
  const retained = data.tasks.filter(task => task.manual || task.status !== 'pending' || activeTaskIds.has(task.id));
  const topicIds = new Set(data.topics.map(topic => topic.id));
  for (const task of retained) {
    if (!remaining.has(task.day)) continue;
    remaining.set(task.day, (remaining.get(task.day) ?? 0) - integerMinutes(task.minutes));
  }
  for (const day of days) {
    if ((remaining.get(day) ?? 0) < 0) {
      proposal.warnings.push(`مهامك المحفوظة في ${day} تتجاوز الوقت المتاح. عدّلها أو زِد الوقت؛ لم نضف مهام لهذا اليوم.`);
      remaining.set(day, 0);
    }
  }
  if (![...capacities.values()].some(minutes => minutes > 0)) {
    proposal.warnings.push('ما فيه وقت متاح في الأيام الثلاثين القادمة. أضف وقتًا يناسبك من الإعدادات.');
  }
  if (retained.some(task => task.status !== 'done' && task.day < today && topicIds.has(task.topic_id))) {
    proposal.warnings.push('عندك مهام محفوظة فات يومها. بقيت في مكانها؛ اختر لها يومًا جديدًا بعد إنهاء أي جلسة مرتبطة بها.');
  }

  const candidates = data.topics.flatMap(topic => {
    const exam = nextExam(topic, data.exams, today);
    const examDays = exam ? daysUntil(exam.exam_on, today) : null;
    const weak = topic.understanding === 'unclear' || topic.understanding === 'review' || topic.evidence === 'no';
    const reservedStudy = retained.filter(task => task.topic_id === topic.id && task.kind === 'study')
      .reduce((sum, task) => sum + integerMinutes(task.minutes), 0);
    const doneStudy = retained.filter(task => task.topic_id === topic.id && task.kind === 'study' && task.status === 'done')
      .reduce((sum, task) => sum + integerMinutes(task.minutes), 0);
    const studyMinutes = topic.completed ? 0 : Math.max(0, integerMinutes(topic.minutes) - reservedStudy);
    const studied = topic.completed || doneStudy >= integerMinutes(topic.minutes);
    const isReview = studied && studyMinutes === 0 && (Boolean(topic.review_on) || weak || (topic.completed && !topic.understanding));
    const reservedReview = retained.filter(task => task.topic_id === topic.id && task.kind === 'review' && task.status !== 'done')
      .reduce((sum, task) => sum + integerMinutes(task.minutes), 0);
    const requestedMinutes = isReview
      ? Math.max(0, Math.min(CHUNK_MINUTES, Math.max(1, integerMinutes(topic.minutes))) - reservedReview)
      : studyMinutes;
    if (requestedMinutes === 0) return [];
    const due = isReview ? topic.review_on || today : today;
    const availableFrom = due > today ? due : today;
    const priority = (examDays !== null ? 2000 / (examDays + 1) : 0)
      + (isReview && due <= today ? 200 : 0)
      + (topic.understanding === 'unclear' ? 180 : topic.understanding === 'review' ? 90 : 0)
      + (topic.evidence === 'no' ? 75 : 0);
    const reasons: string[] = [];
    if (exam) reasons.push(examDays === 0 ? 'اختبارها اليوم' : `باقي ${examDays} يوم على اختبارها`);
    if (isReview && due <= today) reasons.push('مراجعتها مستحقة');
    if (topic.understanding === 'unclear') reasons.push('سجّلت أنها مو واضحة');
    else if (topic.understanding === 'review') reasons.push('سجّلت أنها تحتاج مراجعة');
    if (topic.evidence === 'no') reasons.push('ما قدرت تحل سؤالًا بدون الحل');
    proposal.reasons[topic.id] = reasons.length ? reasons.join('، و') : isReview
      ? `مراجعة مقررة في ${due}` : 'جزئية باقي ما خلصتها، وتناسب الوقت المتاح';
    return [{ topic, exam, priority, requestedMinutes, availableFrom, kind: isReview ? 'review' as const : 'study' as const }];
  }).sort((a, b) => b.priority - a.priority ||
    (a.exam?.exam_on ?? '9999').localeCompare(b.exam?.exam_on ?? '9999') ||
    a.topic.title.localeCompare(b.topic.title, 'ar') || a.topic.id.localeCompare(b.topic.id));

  for (const candidate of candidates) {
    let unallocated = candidate.requestedMinutes;
    for (const day of days) {
      if (day < candidate.availableFrom || (candidate.exam && day >= candidate.exam.exam_on)) continue;
      let available = remaining.get(day) ?? 0;
      while (unallocated > 0 && available > 0) {
        const minutes = Math.min(CHUNK_MINUTES, unallocated, available);
        const position = Math.max(-1, ...retained.filter(task => task.day === day).map(task => task.position),
          ...proposal.tasks.filter(task => task.day === day).map(task => task.position)) + 1;
        proposal.tasks.push({
          id: crypto.randomUUID(), user_id: profile.user_id, topic_id: candidate.topic.id,
          day, minutes, position, status: 'pending', manual: false, kind: candidate.kind,
        });
        unallocated -= minutes;
        available -= minutes;
        remaining.set(day, available);
      }
      if (unallocated === 0) break;
    }
    if (unallocated > 0) {
      // Reviews outside the horizon are simply not due in this plan.
      if (candidate.availableFrom > days[days.length - 1] && !candidate.exam) continue;
      if (candidate.exam && candidate.exam.exam_on > days[days.length - 1]) {
        proposal.warnings.push(`«${candidate.topic.title}»: بقي ${unallocated} دقيقة بعد خطة الثلاثين يومًا. الاختبار أبعد من ذلك؛ اقترح خطة جديدة لاحقًا لتغطية الباقي.`);
        continue;
      }
      const deadline = candidate.exam ? `قبل اختبار «${candidate.exam.title}» في ${candidate.exam.exam_on}` : 'خلال الثلاثين يومًا القادمة';
      proposal.warnings.push(`الوقت ما يكفي لـ«${candidate.topic.title}»: باقي ${unallocated} دقيقة ${deadline}. رتّب الأولوية أو عدّل وقتك المتاح.`);
    }
  }
  proposal.tasks.sort((a, b) => a.day.localeCompare(b.day) || a.position - b.position);
  return proposal;
}
