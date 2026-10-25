import {db,check} from './supabase';

export async function sendOfficeInvite(inviteId:string,token:string):Promise<void>{
 const client=db();
 let {data:sessionData,error:sessionError}=await client.auth.getSession();
 if(sessionError)throw sessionError;
 if(!sessionData.session)throw new Error('سجّل دخولك قبل إرسال الدعوة.');
 let accessToken=sessionData.session.access_token;
 const verified=await client.auth.getUser(accessToken);
 if(verified.error||!verified.data.user){
  const refreshed=check(await client.auth.refreshSession());
  if(!refreshed.data.session)throw new Error('انتهت الجلسة. سجّل دخولك مجددًا.');
  accessToken=refreshed.data.session.access_token;
 }
 const invoke=(jwt:string)=>client.functions.invoke('send-office-invite',{
  body:{invite_id:inviteId,token},
  headers:{Authorization:`Bearer ${jwt}`},
 });
 let result=await invoke(accessToken);
 if(result.error&&(result.error.context as Response|undefined)?.status===401){
  const refreshed=check(await client.auth.refreshSession());
  if(!refreshed.data.session)throw new Error('انتهت الجلسة. سجّل دخولك مجددًا.');
  result=await invoke(refreshed.data.session.access_token);
 }
 if(result.error){
  let message=result.error.message;
  const context=result.error.context as Response|undefined;
  if(context?.json){try{const body=await context.json();message=body.message??message;}catch{}}
  throw new Error(message);
 }
 if(!result.data?.accepted)throw new Error('لم تؤكد خدمة البريد قبول الرسالة.');
}
