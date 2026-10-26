import { db, check } from './supabase';
/** Read-only export of records from the former personal product. No team view queries them. */
export async function fetchPersonalArchive(userId:string) {
  const names = ['profiles','subjects','topics','exams','documents','tasks','sessions','assessments','session_closures'] as const;
  const results = await Promise.all(names.map(async name => {
    const rows:Record<string,unknown>[]=[];
    for(let from=0;from<=10000;from+=500){
      const result=check(await db().from(name).select('*',{count:'exact'}).eq('user_id',userId).order(name==='profiles'?'user_id':'id').range(from,from+499));
      rows.push(...(result.data??[]));
      if((result.data?.length??0)<500){
        if(result.count!==null && rows.length<result.count) throw new Error('خادم البيانات حدّد حجم القراءة. لم نعرض أو نصدر نسخة ناقصة.');
        return rows;
      }
    }
    throw new Error('تجاوزت البيانات حد التحميل الآمن. لم نعرض بيانات ناقصة.');
  }));
  return {profile:results[0][0]??null,subjects:results[1],topics:results[2],exams:results[3],documents:results[4],tasks:results[5],sessions:results[6],assessments:results[7],session_closures:results[8]};
}
export function errorMessage(error:unknown):string {
  const message = error instanceof Error ? error.message : typeof error==='object' && error && 'message' in error ? String(error.message) : 'تعذّر الاتصال. جرّب مرة ثانية.';
  if(typeof error==='object'&&error&&'code' in error&&error.code==='PGRST116') return 'تغيّر السجل أو لم يعد متاحًا. حدّث البيانات وراجع تعديلك قبل إعادة الحفظ.';
  if(/fetch|network|offline/i.test(message)) return 'الاتصال انقطع. ما تأكدنا من الحفظ؛ حدّث البيانات قبل المحاولة مرة ثانية.';
  if(/Invalid login credentials/i.test(message)) return 'البريد أو كلمة المرور غير صحيحة.';
  if(/Email not confirmed/i.test(message)) return 'افتح رسالة تأكيد البريد أولًا.';
  if(/rate limit/i.test(message)) return 'طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.';
  if(/schema cache|does not exist|Could not find the table/i.test(message)) return 'قاعدة البيانات تحتاج ملف الإعداد SQL. راجع خطوات README ثم أعد التحميل.';
  if(/active.*session|one_active|already.*active/i.test(message)) return 'فيه جلسة شغّالة على حسابك. حدّث البيانات لاستكمالها.';
  if(/version|conflict|stale/i.test(message)) return 'تغيّرت الجلسة من جهاز آخر. حدّثنا البيانات؛ أعد المحاولة من حالتها الحالية.';
  return message;
}
