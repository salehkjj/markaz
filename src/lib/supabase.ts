import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key && !url.includes('your-project') && !key.includes('your-publishable'));
export const supabase = configured ? createClient(url!, key!, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
export function db() { if (!supabase) throw new Error('أكمل إعداد Supabase أولًا.'); return supabase; }
export function check<T extends {error:unknown}>(result:T):T { if(result.error) throw result.error; return result; }
