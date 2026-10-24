-- Add work projects and quick tasks without moving or rewriting study data.
alter table public.subjects add column kind text not null default 'study' check (kind in ('study','work'));
alter table public.subjects add column project_status text not null default 'planned' check (project_status in ('planned','active','completed'));

alter table public.topics alter column subject_id drop not null;
alter table public.topics add column mode text not null default 'study' check (mode in ('study','work'));
alter table public.topics add column priority text not null default 'normal' check (priority in ('low','normal','high'));
alter table public.topics add column due_on date;
alter table public.topics add column work_state text not null default 'todo' check (work_state in ('todo','blocked','done'));
alter table public.topics add constraint work_without_project check (subject_id is not null or mode='work');
create index topics_work_queue on public.topics(user_id,mode,work_state,due_on);

create table public.session_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  topic_id uuid,
  outcome text not null check(outcome in ('done','blocked','skipped')),
  note text not null default '' check(char_length(note)<=4000),
  created_at timestamptz not null default now(),
  foreign key(user_id,session_id) references public.sessions(user_id,id) on delete cascade,
  foreign key(user_id,topic_id) references public.topics(user_id,id) on delete set null(topic_id)
);
alter table public.session_closures enable row level security;
revoke all on public.session_closures from anon,authenticated;
grant select on public.session_closures to authenticated;
create policy own_select on public.session_closures for select to authenticated using(user_id=(select auth.uid()));

create function public.close_focus(p_session_id uuid,p_outcome text,p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); s public.sessions; t public.topics; c public.session_closures;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into c from public.session_closures where session_id=p_session_id and user_id=u;
  if found then return to_jsonb(c); end if;
  select * into s from public.sessions where id=p_session_id and user_id=u;
  if not found or s.status<>'completed' or s.kind<>'focus' then raise exception 'الجلسة غير مكتملة.'; end if;
  if exists(select 1 from public.assessments where session_id=s.id and user_id=u) then raise exception 'سبق حفظ تقييم هذه الجلسة.'; end if;
  if p_outcome not in ('done','blocked','skipped') or p_note is null or char_length(p_note)>4000 then raise exception 'راجع نتيجة الجلسة.'; end if;
  if s.topic_id is not null then select * into t from public.topics where id=s.topic_id and user_id=u; end if;
  if p_outcome<>'skipped' and (s.topic_id is null or t.mode is distinct from 'work') then raise exception 'الإنجاز والعائق للمهمة العملية فقط.'; end if;
  insert into public.session_closures(user_id,session_id,topic_id,outcome,note)
    values(u,s.id,s.topic_id,p_outcome,p_note) returning * into c;
  if p_outcome='done' then
    update public.topics set work_state='done',completed=true,notes=case when p_note='' then notes else p_note end where id=s.topic_id and user_id=u;
    update public.tasks set status='done' where topic_id=s.topic_id and user_id=u and status<>'done';
  elsif p_outcome='blocked' then
    update public.topics set work_state='blocked',notes=case when p_note='' then notes else p_note end where id=s.topic_id and user_id=u;
  end if;
  return to_jsonb(c);
end $$;

create function public.set_work_state(p_topic_id uuid,p_state text,p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); t public.topics;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  if p_state not in ('todo','blocked','done') or p_note is null or char_length(p_note)>4000 then raise exception 'راجع حالة المهمة.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into t from public.topics where id=p_topic_id and user_id=u and mode='work' for update;
  if not found then raise exception 'المهمة غير متاحة.'; end if;
  update public.topics set work_state=p_state,completed=(p_state='done'),notes=case when p_note='' then notes else p_note end where id=p_topic_id and user_id=u;
  update public.tasks set status=case when p_state='done' then 'done' else 'pending' end,manual=true where topic_id=p_topic_id and user_id=u;
  return p_topic_id;
end $$;

revoke execute on function public.close_focus(uuid,text,text),public.set_work_state(uuid,text,text) from public,anon;
grant execute on function public.close_focus(uuid,text,text),public.set_work_state(uuid,text,text) to authenticated;
