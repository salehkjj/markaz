import { db, check } from './supabase';
import type { StudyData } from './types';
export async function fetchStudyData(userId:string):Promise<StudyData> {
  const names = ['profiles','subjects','topics','exams','documents','tasks','sessions','assessments'] as const;
  const results = await Promise.all(names.map(async name => {
    const rows:Record<string,unknown>[]=[];
    for(let from=0;from<=10000;from+=500){
      const result=check(await db().from(name).select('*').eq('user_id',userId).order(name==='profiles'?'user_id':'id').range(from,from+499));
      rows.push(...(result.data??[]));
      if((result.data?.length??0)<500)return rows;
    }
    throw new Error('تجاوزت البيانات حد التحميل الآمن. لم نعرض بيانات ناقصة.');
  }));
  return {profile:results[0][0]??null,subjects:results[1],topics:results[2],exams:results[3],documents:results[4],tasks:results[5],sessions:results[6],assessments:results[7]} as unknown as StudyData;
}
export function errorMessage(error:unknown):string {
  const message = error instanceof Error ? error.message : typeof error==='object' && error && 'message' in error ? String(error.message) : 'تعذّر الاتصال. جرّب مرة ثانية.';
  if(/fetch|network|offline/i.test(message)) return 'الاتصال انقطع. ما تأكدنا من الحفظ؛ حدّث البيانات قبل المحاولة مرة ثانية.';
  if(/Invalid login credentials/i.test(message)) return 'البريد أو كلمة المرور غير صحيحة.';
  if(/Email not confirmed/i.test(message)) return 'افتح رسالة تأكيد البريد أولًا.';
  if(/rate limit/i.test(message)) return 'طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.';
  if(/schema cache|does not exist|Could not find the table/i.test(message)) return 'قاعدة البيانات تحتاج ملف الإعداد SQL. راجع خطوات README ثم أعد التحميل.';
  if(/capacity|available time/i.test(message)) return 'مهام هذا اليوم تتجاوز وقتك المتاح. عدّل المدة أو اختر يومًا آخر.';
  if(/active.*session|one_active|already.*active/i.test(message)) return 'فيه جلسة شغّالة على حسابك. حدّث البيانات لاستكمالها.';
  if(/version|conflict|stale/i.test(message)) return 'تغيّرت الجلسة من جهاز آخر. حدّثنا البيانات؛ أعد المحاولة من حالتها الحالية.';
  return message;
}
