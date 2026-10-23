-- Markaz: user-owned data, private files and server-authoritative focus sessions.
-- Apply to a Supabase project as postgres. No service role is needed by the app.

create function public.valid_weekly_minutes(v integer[]) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(array_length(v, 1) = 7 and array_lower(v, 1) = 1 and not exists(select 1 from unnest(v) x where x is null or x < 0 or x > 1440), false)
$$;
create function public.valid_rest_days(v integer[]) returns boolean language sql immutable set search_path = '' as $$
  select v is not null and not exists(select 1 from unnest(v) x where x is null or x < 0 or x > 6)
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check(char_length(display_name) <= 100),
  weekly_minutes integer[] not null default array[0,0,0,0,0,0,0] check(public.valid_weekly_minutes(weekly_minutes)),
  rest_days integer[] not null default '{}' check(public.valid_rest_days(rest_days)),
  onboarded boolean not null default false
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 200),
  color text not null default '#b94c39' check(char_length(color) <= 32),
  created_at timestamptz not null default now(),
  unique(user_id,id)
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  name text not null check(char_length(trim(name)) between 1 and 500),
  storage_path text not null check(split_part(storage_path,'/',1)=user_id::text and char_length(storage_path) <= 1000),
  pages integer check(pages between 1 and 10000),
  unique(user_id,id), unique(user_id,subject_id,id), unique(storage_path),
  foreign key(user_id,subject_id) references public.subjects(user_id,id) on delete cascade
);
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null check(char_length(trim(title)) between 1 and 500),
  chapter text not null default '' check(char_length(chapter) <= 500),
  minutes integer not null default 25 check(minutes between 1 and 10080),
  document_id uuid,
  page_start integer check(page_start > 0),
  page_end integer check(page_end > 0 and (page_start is null or page_end >= page_start)),
  completed boolean not null default false,
  understanding text check(understanding in ('understood','review','unclear')),
  evidence text check(evidence in ('yes','no','untried')),
  review_on date,
  notes text not null default '' check(char_length(notes) <= 4000),
  unique(user_id,id),
  foreign key(user_id,subject_id) references public.subjects(user_id,id) on delete cascade,
  foreign key(user_id,subject_id,document_id) references public.documents(user_id,subject_id,id) on delete set null(document_id)
);
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null,
  title text not null check(char_length(trim(title)) between 1 and 200),
  exam_on date not null,
  topic_ids uuid[] not null default '{}',
  unique(user_id,id),
  foreign key(user_id,subject_id) references public.subjects(user_id,id) on delete cascade
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic_id uuid not null,
  day date not null,
  minutes integer not null check(minutes between 1 and 1440),
  position integer not null default 0,
  status text not null default 'pending' check(status in ('pending','done','deferred')),
  manual boolean not null default false,
  kind text not null default 'study' check(kind in ('study','review')),
  unique(user_id,id),
  foreign key(user_id,topic_id) references public.topics(user_id,id) on delete cascade
);
create index tasks_user_day on public.tasks(user_id,day);
create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid,
  task_id uuid,
  kind text not null check(kind in ('focus','break')),
  status text not null check(status in ('running','paused','completed','cancelled')),
  duration_seconds integer not null check(duration_seconds between 60 and 14400),
  elapsed_seconds integer not null default 0 check(elapsed_seconds >= 0 and elapsed_seconds <= duration_seconds),
  started_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1 check(version > 0),
  unique(user_id,id),
  foreign key(user_id,topic_id) references public.topics(user_id,id) on delete set null(topic_id),
  foreign key(user_id,task_id) references public.tasks(user_id,id) on delete set null(task_id),
  check((status='running') = (started_at is not null)),
  check((status='completed') = (completed_at is not null))
);
create unique index one_active_session_per_user on public.sessions(user_id) where status in ('running','paused');
create index sessions_user_completed on public.sessions(user_id,completed_at);
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  topic_id uuid,
  understanding text not null check(understanding in ('understood','review','unclear')),
  evidence text not null check(evidence in ('yes','no','untried')),
  note text not null default '' check(char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  foreign key(user_id,session_id) references public.sessions(user_id,id) on delete cascade,
  foreign key(user_id,topic_id) references public.topics(user_id,id) on delete set null(topic_id)
);

-- Ownership is enforced both on reads/writes and on every relationship.
do $$ declare t text; begin
  foreach t in array array['profiles','subjects','documents','topics','exams','tasks','sessions','assessments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['profiles','subjects','documents','topics','exams','tasks'] loop
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))',t);
    execute format('grant insert, update, delete on public.%I to authenticated',t);
  end loop;
end $$;

create function public.validate_exam_topics() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from unnest(new.topic_ids) as x(id) where x.id is null or not exists(select 1 from public.topics t where t.id=x.id and t.user_id=new.user_id and t.subject_id=new.subject_id)) then
    raise exception 'اختَر جزئيات من نفس المادة والحساب.';
  end if;
  return new;
end $$;
create trigger validate_exam_topics before insert or update on public.exams for each row execute function public.validate_exam_topics();
create function public.remove_exam_topic() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.exams set topic_ids=array_remove(topic_ids,old.id) where user_id=old.user_id and old.id=any(topic_ids);
  return old;
end $$;
create trigger remove_exam_topic before delete on public.topics for each row execute function public.remove_exam_topic();

-- Serialize schedule mutations per account, including two devices editing at once.
create function public.guard_task_capacity() returns trigger language plpgsql set search_path = '' as $$
declare p public.profiles; total integer; weekday integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  select * into p from public.profiles where user_id=new.user_id;
  if not found then raise exception 'احفظ وقتك المتاح في الإعدادات أولًا.'; end if;
  weekday := extract(dow from new.day)::integer;
  select coalesce(sum(minutes),0) into total from public.tasks where user_id=new.user_id and day=new.day and id<>new.id;
  if new.day >= (now() at time zone 'Asia/Riyadh')::date and (weekday=any(p.rest_days) or total+new.minutes > p.weekly_minutes[weekday+1]) then
    raise exception 'وقت هذا اليوم ما يكفي. غيّر اليوم أو المدة أو وقتك المتاح.';
  end if;
  return new;
end $$;
create trigger guard_task_capacity before insert or update on public.tasks for each row execute function public.guard_task_capacity();
create function public.guard_profile_capacity() returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if exists(select 1 from public.tasks where user_id=new.user_id and day >= (now() at time zone 'Asia/Riyadh')::date group by day having sum(minutes)>new.weekly_minutes[extract(dow from day)::integer+1] or extract(dow from day)::integer=any(new.rest_days)) then
    raise exception 'فيه مهام تتجاوز الوقت الجديد. انقلها أو عدّلها في خطتي أولًا.';
  end if;
  return new;
end $$;
create trigger guard_profile_capacity before insert or update on public.profiles for each row execute function public.guard_profile_capacity();

create function public.server_time() returns timestamptz language sql stable set search_path = '' as $$ select now() $$;

create function public.start_focus(p_topic_id uuid default null,p_task_id uuid default null,p_kind text default 'focus',p_duration_seconds integer default 1500,p_request_id uuid default gen_random_uuid()) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); s public.sessions; task public.tasks;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into s from public.sessions where id=p_request_id and user_id=u;
  if found then return to_jsonb(s)||jsonb_build_object('server_now',clock_timestamp()); end if;
  if p_kind not in ('focus','break') or p_duration_seconds not between 60 and 14400 then raise exception 'مدة الجلسة بين دقيقة و٢٤٠ دقيقة.'; end if;
  if p_topic_id is not null and not exists(select 1 from public.topics where id=p_topic_id and user_id=u) then raise exception 'الجزئية غير متاحة.'; end if;
  if p_task_id is not null then
    select * into task from public.tasks where id=p_task_id and user_id=u;
    if not found or task.topic_id is distinct from p_topic_id or task.status='done' then raise exception 'المهمة غير متاحة.'; end if;
  end if;
  if p_kind='break' and (p_task_id is not null or p_topic_id is not null) then raise exception 'الراحة ما ترتبط بمهمة.'; end if;
  if exists(select 1 from public.sessions where user_id=u and status in ('running','paused')) then raise exception 'عندك جلسة شغالة على حسابك. استكملها أو أنهها أولًا.'; end if;
  insert into public.sessions(id,user_id,topic_id,task_id,kind,status,duration_seconds,started_at) values(p_request_id,u,p_topic_id,p_task_id,p_kind,'running',p_duration_seconds,clock_timestamp()) returning * into s;
  return to_jsonb(s)||jsonb_build_object('server_now',clock_timestamp());
end $$;

create function public.control_focus(p_session_id uuid,p_action text,p_expected_version integer) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); s public.sessions; stamp timestamptz:=clock_timestamp(); elapsed integer; endpoint timestamptz;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into s from public.sessions where id=p_session_id and user_id=u for update;
  if not found then raise exception 'الجلسة غير متاحة.'; end if;
  if (p_action='complete' and s.status='completed') or (p_action='cancel' and s.status='cancelled') then return to_jsonb(s)||jsonb_build_object('server_now',stamp); end if;
  if s.version is distinct from p_expected_version then raise exception 'تغيّرت الجلسة من جهاز ثاني. حدّثها وحاول مرة ثانية.'; end if;
  if s.status not in ('running','paused') then raise exception 'الجلسة منتهية.'; end if;
  elapsed := least(s.duration_seconds,s.elapsed_seconds+case when s.status='running' then greatest(0,floor(extract(epoch from stamp-s.started_at))::integer) else 0 end);
  endpoint := case when s.status='running' then s.started_at+make_interval(secs => s.duration_seconds-s.elapsed_seconds) else stamp end;
  if p_action='complete' then
    if elapsed<s.duration_seconds then raise exception 'وقت الجلسة ما اكتمل. تقدر تلغيها إذا بتوقف.'; end if;
    update public.sessions set status='completed',elapsed_seconds=duration_seconds,started_at=null,completed_at=endpoint,version=version+1 where id=s.id returning * into s;
  elsif p_action='cancel' then
    update public.sessions set status='cancelled',elapsed_seconds=elapsed,started_at=null,version=version+1 where id=s.id returning * into s;
  elsif p_action='pause' and s.status='running' then
    -- A timer already at its endpoint is completed, not parked at 00:00 across midnight.
    if elapsed>=s.duration_seconds then
      update public.sessions set status='completed',elapsed_seconds=duration_seconds,started_at=null,completed_at=endpoint,version=version+1 where id=s.id returning * into s;
    else
      update public.sessions set status='paused',elapsed_seconds=elapsed,started_at=null,version=version+1 where id=s.id returning * into s;
    end if;
  elsif p_action='resume' and s.status='paused' then
    update public.sessions set status='running',started_at=stamp,version=version+1 where id=s.id returning * into s;
  else raise exception 'ما نقدر نطبّق هذا الإجراء على الجلسة.';
  end if;
  return to_jsonb(s)||jsonb_build_object('server_now',stamp);
end $$;

create function public.assess_focus(p_session_id uuid,p_understanding text,p_evidence text,p_note text default '') returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); s public.sessions; a public.assessments; study_minutes integer; stamp date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into a from public.assessments where session_id=p_session_id and user_id=u;
  if found then return to_jsonb(a); end if;
  select * into s from public.sessions where id=p_session_id and user_id=u;
  if not found or s.status<>'completed' or s.kind<>'focus' then raise exception 'التقييم لجلسة تركيز مكتملة فقط.'; end if;
  if p_understanding not in ('understood','review','unclear') or p_evidence not in ('yes','no','untried') or p_note is null or char_length(p_note)>4000 then raise exception 'راجع خيارات التقييم والملاحظة.'; end if;
  insert into public.assessments(user_id,session_id,topic_id,understanding,evidence,note) values(u,s.id,s.topic_id,p_understanding,p_evidence,p_note) returning * into a;
  if s.task_id is not null then
    update public.tasks t set status='done' where t.id=s.task_id and t.user_id=u and (select coalesce(sum(duration_seconds),0) from public.sessions f where f.user_id=u and f.task_id=t.id and f.kind='focus' and f.status='completed')>=t.minutes*60;
  end if;
  if s.topic_id is not null then
    select coalesce(sum(minutes),0) into study_minutes from public.tasks where user_id=u and topic_id=s.topic_id and status='done' and kind='study';
    update public.topics set understanding=p_understanding,evidence=p_evidence,notes=p_note,
      completed=completed or study_minutes>=minutes,
      review_on=stamp+case when p_understanding='unclear' or p_evidence='no' then 1 when p_understanding='review' or p_evidence='untried' then 2 else 7 end
    where id=s.topic_id and user_id=u;
  end if;
  return to_jsonb(a);
end $$;

create function public.replace_plan(p_tasks jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); item jsonb; counter integer:=0;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_array_length(p_tasks)>2000 then raise exception 'الخطة غير صالحة.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if exists(select 1 from public.sessions s join public.tasks t on t.id=s.task_id where s.user_id=u and s.status in ('running','paused') and not t.manual and t.status='pending') then raise exception 'أنه الجلسة الحالية قبل إعادة توزيع الخطة.'; end if;
  -- A completed focus waiting for assessment still needs its original task.
  delete from public.tasks t where t.user_id=u and not t.manual and t.status='pending'
    and not exists(select 1 from public.sessions s where s.task_id=t.id and s.user_id=u
      and (s.status in ('running','paused') or (s.status='completed' and s.kind='focus'
        and not exists(select 1 from public.assessments a where a.session_id=s.id and a.user_id=u))));
  for item in select value from jsonb_array_elements(p_tasks) loop
    if (item->>'day')::date < (now() at time zone 'Asia/Riyadh')::date then raise exception 'الخطة الجديدة تبدأ من اليوم.'; end if;
    insert into public.tasks(user_id,topic_id,day,minutes,position,status,manual,kind)
      values(u,(item->>'topic_id')::uuid,(item->>'day')::date,(item->>'minutes')::integer,coalesce((item->>'position')::integer,counter),'pending',false,coalesce(item->>'kind','study'));
    counter:=counter+1;
  end loop;
  return counter;
end $$;

create function public.reorder_tasks(p_task_ids uuid[]) returns integer language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); matching integer; day_count integer; i integer;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if coalesce(array_length(p_task_ids,1),0)=0 then return 0; end if;
  select count(*),count(distinct day) into matching,day_count from public.tasks where user_id=u and id=any(p_task_ids);
  if matching<>array_length(p_task_ids,1) or day_count<>1 then raise exception 'اختر مهام يوم واحد من حسابك.'; end if;
  for i in 1..array_length(p_task_ids,1) loop update public.tasks set position=i-1,manual=true where id=p_task_ids[i] and user_id=u; end loop;
  return matching;
end $$;

-- Do not allow anonymous/public invocation of helpers or mutation RPCs.
revoke execute on function public.valid_weekly_minutes(integer[]) from public;
revoke execute on function public.valid_rest_days(integer[]) from public;
grant execute on function public.valid_weekly_minutes(integer[]),public.valid_rest_days(integer[]) to authenticated;
revoke execute on function public.validate_exam_topics(),public.remove_exam_topic(),public.guard_task_capacity(),public.guard_profile_capacity() from public;
revoke execute on function public.start_focus(uuid,uuid,text,integer,uuid),public.control_focus(uuid,text,integer),public.assess_focus(uuid,text,text,text),public.replace_plan(jsonb),public.reorder_tasks(uuid[]),public.server_time() from public;
grant execute on function public.start_focus(uuid,uuid,text,integer,uuid),public.control_focus(uuid,text,integer),public.assess_focus(uuid,text,text,text),public.replace_plan(jsonb),public.reorder_tasks(uuid[]),public.server_time() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('study-files','study-files',false,20971520,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy study_files_select on storage.objects for select to authenticated using(bucket_id='study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy study_files_insert on storage.objects for insert to authenticated with check(bucket_id='study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy study_files_update on storage.objects for update to authenticated using(bucket_id='study-files' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy study_files_delete on storage.objects for delete to authenticated using(bucket_id='study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
