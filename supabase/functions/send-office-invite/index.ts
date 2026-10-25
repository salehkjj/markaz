import {createClient} from 'npm:@supabase/supabase-js@2.76.0';

const site='https://salehkjj.github.io/markaz/';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async request=>{
 const origin=request.headers.get('origin')??'';
 const allowed=origin==='https://salehkjj.github.io'||origin==='http://localhost:3000';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed?origin:'https://salehkjj.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(status:number,message:string)=>new Response(JSON.stringify({message}),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,'الطلب غير متاح.');
 const auth=request.headers.get('authorization')??'';
 if(!auth.startsWith('Bearer '))return reply(401,'سجّل دخولك أولًا.');
 let body:{invite_id?:string;token?:string};
 try{body=await request.json();}catch{return reply(400,'طلب الدعوة غير صحيح.');}
 if(!uuid.test(body.invite_id??'')||!uuid.test(body.token??''))return reply(400,'رابط الدعوة غير صحيح.');
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!anon)return reply(503,'إعداد خدمة الدعوات غير مكتمل.');
 const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:user,error:userError}=await client.auth.getUser(auth.slice(7));
 if(userError||!user.user)return reply(401,'انتهت الجلسة. سجّل دخولك من جديد.');
 const {data:invite,error:claimError}=await client.rpc('claim_office_invite_email',{p_invite:body.invite_id,p_token:body.token});
 if(claimError||!invite)return reply(403,claimError?.message??'الدعوة غير متاحة للإرسال.');
 const recipient=String(invite.email);
 const inviteUrl=`${site}?invite=${encodeURIComponent(body.token!)}`;
 const mailClient=createClient(url,anon,{auth:{persistSession:false}});
 const {error:mailError}=await mailClient.auth.signInWithOtp({email:recipient,options:{emailRedirectTo:inviteUrl,shouldCreateUser:true}});
 if(mailError){console.error('Invitation mail rejected by Auth SMTP',mailError.status,mailError.code);return reply(502,mailError.message.includes('not authorized')?'بريد Supabase الافتراضي لا يرسل لهذا العنوان. اضبط SMTP مجانيًا في إعدادات Auth.':'لم تقبل خدمة البريد إرسال الدعوة. الرابط ظاهر للنسخ اليدوي.');}
 return new Response(JSON.stringify({accepted:true}),{status:200,headers});
});
