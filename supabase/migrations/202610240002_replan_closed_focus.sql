-- A focus session closed without a study rating no longer pins its old automatic task.
create or replace function public.replace_plan(p_tasks jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); item jsonb; counter integer:=0;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_array_length(p_tasks)>2000 then raise exception 'الخطة غير صالحة.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if exists(select 1 from public.sessions s join public.tasks t on t.id=s.task_id where s.user_id=u and s.status in ('running','paused') and not t.manual and t.status='pending') then raise exception 'أنه الجلسة الحالية قبل إعادة توزيع الخطة.'; end if;
  delete from public.tasks t where t.user_id=u and not t.manual and t.status='pending'
    and not exists(select 1 from public.sessions s where s.task_id=t.id and s.user_id=u
      and (s.status in ('running','paused') or (s.status='completed' and s.kind='focus'
        and not exists(select 1 from public.assessments a where a.session_id=s.id and a.user_id=u)
        and not exists(select 1 from public.session_closures c where c.session_id=s.id and c.user_id=u))));
  for item in select value from jsonb_array_elements(p_tasks) loop
    if (item->>'day')::date < (now() at time zone 'Asia/Riyadh')::date then raise exception 'الخطة الجديدة تبدأ من اليوم.'; end if;
    insert into public.tasks(user_id,topic_id,day,minutes,position,status,manual,kind)
      values(u,(item->>'topic_id')::uuid,(item->>'day')::date,(item->>'minutes')::integer,coalesce((item->>'position')::integer,counter),'pending',false,coalesce(item->>'kind','study'));
    counter:=counter+1;
  end loop;
  return counter;
end $$;
revoke execute on function public.replace_plan(jsonb) from public,anon;
grant execute on function public.replace_plan(jsonb) to authenticated;
