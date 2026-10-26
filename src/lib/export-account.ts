import {check,db} from './supabase';
import {fetchPersonalArchive} from './data';
import type {Office} from './team';

const officeTables={
 office_members:'user_id',office_invites:'id',office_projects:'id',office_tasks:'id',
 office_decisions:'id',office_assets:'id',office_task_comments:'id',
 office_weekly_goals:'week_start',office_weekly_updates:'week_start',
} as const;

async function readOfficeRows(table:keyof typeof officeTables,officeId:string){
 const rows:Record<string,unknown>[]=[];
 for(let from=0;from<10000;from+=500){
  const result=check(await db().from(table).select('*',{count:'exact'}).eq('office_id',officeId).order(officeTables[table]).range(from,from+499));
  rows.push(...(result.data??[]));
  if((result.data?.length??0)<500){if(result.count!==null&&rows.length<result.count)throw new Error('تعذر تصدير كامل البيانات؛ لم ننشئ نسخة ناقصة.');return rows;}
 }
 throw new Error('تجاوزت البيانات حد التصدير الآمن؛ لم ننشئ نسخة ناقصة.');
}

export async function exportAccount(userId:string,offices:Office[]){
 const legacy=await fetchPersonalArchive(userId);
 const spaces=[];
 for(const office of offices){
  const content:Record<string,unknown>={office};
  for(const table of Object.keys(officeTables) as Array<keyof typeof officeTables>){content[table]=await readOfficeRows(table,office.id);}
  spaces.push(content);
 }
 return {format:'markaz-backup',version:2,exported_at:new Date().toISOString(),timezone:'Asia/Riyadh',offices:spaces,personal_archive:legacy,files_note:'ملفات التخزين نفسها غير مضمّنة في JSON؛ نزّلها من روابطها الخاصة داخل المشروع.'};
}
