-- Team offices are separate from the existing private study and work records.
-- No old rows are moved, rewritten, or exposed to office members.
create table public.offices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check(char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.office_members (
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','member')),
  member_name text not null default '' check(char_length(member_name)<=120),
  joined_at timestamptz not null default now(),
  primary key(office_id,user_id)
);
create unique index one_owner_per_office on public.office_members(office_id) where role='owner';
create index office_members_user on public.office_members(user_id,office_id);

create function public.is_office_member(p_office uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.office_members where office_id=p_office and user_id=auth.uid())
$$;
create function public.is_office_owner(p_office uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.offices where id=p_office and owner_id=auth.uid())
$$;
revoke execute on function public.is_office_member(uuid),public.is_office_owner(uuid) from public,anon;
grant execute on function public.is_office_member(uuid),public.is_office_owner(uuid) to authenticated;

create table public.office_invites (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  email text not null check(char_length(email) between 3 and 320),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index office_invites_office on public.office_invites(office_id,created_at desc);

create table public.office_projects (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 160),
  description text not null default '' check(char_length(description)<=3000),
  status text not null default 'planned' check(status in ('planned','active','blocked','done')),
  due_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(office_id,id)
);
create index office_projects_list on public.office_projects(office_id,status,due_on);
create table public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  project_id uuid not null,
  title text not null check(char_length(trim(title)) between 1 and 240),
  assignee_id uuid,
  status text not null default 'planned' check(status in ('planned','active','blocked','done')),
  priority text not null default 'normal' check(priority in ('low','normal','high')),
  due_on date,
  notes text not null default '' check(char_length(notes)<=4000),
  blocker_reason text not null default '' check(char_length(blocker_reason)<=2000),
  blocked_by uuid,
  goal_week_start date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(office_id,project_id) references public.office_projects(office_id,id) on delete cascade,
  foreign key(office_id,assignee_id) references public.office_members(office_id,user_id),
  foreign key(office_id,blocked_by) references public.office_members(office_id,user_id)
);
create index office_tasks_queue on public.office_tasks(office_id,assignee_id,status,due_on);
create index office_tasks_project on public.office_tasks(project_id,created_at desc);
create table public.office_decisions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  project_id uuid not null,
  title text not null check(char_length(trim(title)) between 1 and 500),
  reason text not null default '' check(char_length(reason)<=3000),
  status text not null default 'pending' check(status in ('pending','approved')),
  created_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(office_id,project_id) references public.office_projects(office_id,id) on delete cascade,
  check((status='approved')=(decided_at is not null))
);
create index office_decisions_list on public.office_decisions(office_id,status,created_at desc);
create table public.office_assets (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  project_id uuid not null,
  name text not null check(char_length(trim(name)) between 1 and 300),
  kind text not null check(kind in ('file','link')),
  url text,
  storage_path text,
  approved boolean not null default false,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(office_id,project_id) references public.office_projects(office_id,id) on delete cascade,
  check((kind='link' and url ~ '^https?://[^ ]+$' and storage_path is null) or
        (kind='file' and url is null and split_part(storage_path,'/',1)=office_id::text and split_part(storage_path,'/',2)=id::text))
);
create unique index one_approved_asset_per_project on public.office_assets(project_id) where approved;
create index office_assets_list on public.office_assets(office_id,project_id,created_at desc);
create table public.office_weekly_goals (
  office_id uuid not null references public.offices(id) on delete cascade,
  week_start date not null,
  goal text not null check(char_length(trim(goal)) between 1 and 500),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(office_id,week_start)
);
alter table public.office_tasks add constraint office_task_goal
  foreign key(office_id,goal_week_start) references public.office_weekly_goals(office_id,week_start) on delete set null(goal_week_start);
create table public.office_weekly_updates (
  office_id uuid not null references public.offices(id) on delete cascade,
  week_start date not null,
  user_id uuid not null,
  done text not null default '' check(char_length(done)<=1000),
  next text not null default '' check(char_length(next)<=1000),
  blocker text not null default '' check(char_length(blocker)<=1000),
  updated_at timestamptz not null default now(),
  primary key(office_id,week_start,user_id),
  foreign key(office_id,user_id) references public.office_members(office_id,user_id)
);

do $$ declare t text; begin
  foreach t in array array['offices','office_members','office_invites','office_projects','office_tasks','office_decisions','office_assets','office_weekly_goals','office_weekly_updates'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;
grant select on public.offices,public.office_members,public.office_projects,public.office_tasks,public.office_decisions,public.office_assets,public.office_weekly_goals,public.office_weekly_updates to authenticated;
grant insert,update,delete on public.office_projects,public.office_tasks,public.office_decisions,public.office_assets,public.office_weekly_goals,public.office_weekly_updates to authenticated;
grant select on public.office_invites to authenticated;
create policy member_read on public.offices for select to authenticated using(public.is_office_member(id));
create policy member_read on public.office_members for select to authenticated using(public.is_office_member(office_id));
create policy owner_read on public.office_invites for select to authenticated using(public.is_office_owner(office_id));
do $$ declare t text; begin
  foreach t in array array['office_projects','office_tasks','office_decisions','office_assets','office_weekly_goals','office_weekly_updates'] loop
    execute format('create policy member_read on public.%I for select to authenticated using(public.is_office_member(office_id))',t);
    execute format('create policy member_add on public.%I for insert to authenticated with check(public.is_office_member(office_id))',t);
    execute format('create policy member_edit on public.%I for update to authenticated using(public.is_office_member(office_id)) with check(public.is_office_member(office_id))',t);
    execute format('create policy member_remove on public.%I for delete to authenticated using(public.is_office_member(office_id))',t);
  end loop;
end $$;
-- No direct writes to offices, memberships, or invitations. The following RPCs are the only path.
create function public.create_office(p_name text,p_project text default null,p_goal text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); office uuid; member_name text;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 120 then raise exception 'أدخل اسم المكتب.'; end if;
  if p_project is not null and char_length(trim(p_project)) not between 1 and 160 then raise exception 'راجع اسم المشروع.'; end if;
  if p_goal is not null and char_length(trim(p_goal)) not between 1 and 500 then raise exception 'راجع هدف الأسبوع.'; end if;
  select coalesce(nullif(display_name,''),'عضو الفريق') into member_name from public.profiles where user_id=u;
  insert into public.offices(owner_id,name) values(u,trim(p_name)) returning id into office;
  insert into public.office_members(office_id,user_id,role,member_name) values(office,u,'owner',coalesce(member_name,'عضو الفريق'));
  if p_project is not null and trim(p_project)<>'' then insert into public.office_projects(office_id,name,created_by) values(office,trim(p_project),u); end if;
  if p_goal is not null and trim(p_goal)<>'' then
    insert into public.office_weekly_goals(office_id,week_start,goal,updated_by) values(office,date_trunc('week',now() at time zone 'Asia/Riyadh')::date,trim(p_goal),u);
  end if;
  return office;
end $$;
create function public.invite_office_member(p_office uuid,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); token uuid:=gen_random_uuid(); invitation public.office_invites;
begin
  if not public.is_office_owner(p_office) then raise exception 'الدعوات للمالك فقط.'; end if;
  if p_email is null or p_email !~* '^[^ @]+@[^ @]+\.[^ @]+$' or char_length(p_email)>320 then raise exception 'راجع البريد الإلكتروني.'; end if;
  insert into public.office_invites(office_id,email,token_hash,expires_at,created_by)
    values(p_office,lower(trim(p_email)),md5(token::text),now()+interval '7 days',u) returning * into invitation;
  return jsonb_build_object('id',invitation.id,'token',token,'expires_at',invitation.expires_at);
end $$;
create function public.accept_office_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); invitation public.office_invites; recipient text;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  select lower(email) into recipient from auth.users where id=u and email_confirmed_at is not null;
  if recipient is null then raise exception 'أكد بريد حسابك أولًا.'; end if;
  select * into invitation from public.office_invites where token_hash=md5(p_token::text) for update;
  if not found or invitation.revoked_at is not null or invitation.accepted_at is not null or invitation.expires_at<=now() or invitation.email<>recipient then
    raise exception 'الدعوة غير صالحة لهذا الحساب أو انتهت.';
  end if;
  insert into public.office_members(office_id,user_id,role,member_name)
    values(invitation.office_id,u,'member',split_part(recipient,'@',1)) on conflict(office_id,user_id) do nothing;
  update public.office_invites set accepted_at=now() where id=invitation.id;
  return invitation.office_id;
end $$;
create function public.revoke_office_invite(p_invite uuid) returns void
language plpgsql security definer set search_path='' as $$
declare office uuid;
begin
  select office_id into office from public.office_invites where id=p_invite;
  if office is null or not public.is_office_owner(office) then raise exception 'الدعوة غير متاحة.'; end if;
  update public.office_invites set revoked_at=now() where id=p_invite and accepted_at is null;
end $$;
create function public.remove_office_member(p_office uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_office_owner(p_office) or p_user=(select owner_id from public.offices where id=p_office) then raise exception 'إزالة العضو غير متاحة.'; end if;
  update public.office_tasks set assignee_id=null where office_id=p_office and assignee_id=p_user;
  update public.office_tasks set blocked_by=null where office_id=p_office and blocked_by=p_user;
  delete from public.office_weekly_updates where office_id=p_office and user_id=p_user;
  delete from public.office_members where office_id=p_office and user_id=p_user;
end $$;

-- Validate provenance and immutable ownership for direct member CRUD.
create function public.guard_office_row() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.office_id<>old.office_id or new.created_by<>old.created_by) then raise exception 'لا يمكن نقل السجل إلى مكتب آخر.'; end if;
  if tg_op='INSERT' and new.created_by is distinct from auth.uid() then raise exception 'منشئ السجل غير صحيح.'; end if;
  if tg_table_name='office_tasks' then new.updated_at:=now(); end if;
  if tg_table_name='office_decisions' then
    if new.status='approved' and (tg_op='INSERT' or old.status<>'approved') then
      new.decided_by:=auth.uid(); new.decided_at:=now();
    elsif new.status='pending' then
      new.decided_by:=null; new.decided_at:=null;
    elsif tg_op='UPDATE' and (new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at) then
      raise exception 'سجل القرار لا يقبل تغيير من اعتمده أو وقته.';
    end if;
  end if;
  return new;
end $$;
create trigger guard_project before insert or update on public.office_projects for each row execute function public.guard_office_row();
create trigger guard_task before insert or update on public.office_tasks for each row execute function public.guard_office_row();
create trigger guard_decision before insert or update on public.office_decisions for each row execute function public.guard_office_row();
create function public.guard_asset() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.office_id<>old.office_id or new.added_by<>old.added_by or new.storage_path is distinct from old.storage_path) then raise exception 'لا يمكن نقل الملف.'; end if;
  if tg_op='INSERT' and new.added_by is distinct from auth.uid() then raise exception 'مضيف الملف غير صحيح.'; end if;
  if (tg_op='INSERT' and new.approved or tg_op='UPDATE' and new.approved is distinct from old.approved) and not public.is_office_owner(new.office_id) then raise exception 'الاعتماد للمالك فقط.'; end if;
  return new;
end $$;
create trigger guard_asset before insert or update on public.office_assets for each row execute function public.guard_asset();
create function public.guard_weekly_update() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.office_id<>old.office_id or new.user_id<>old.user_id) then raise exception 'لا يمكن نقل التحديث.'; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'التحديث الشخصي لصاحبه فقط.'; end if;
  return new;
end $$;
create trigger guard_weekly_update before insert or update on public.office_weekly_updates for each row execute function public.guard_weekly_update();
create function public.guard_weekly_goal() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and new.office_id<>old.office_id then raise exception 'لا يمكن نقل الهدف.'; end if;
  new.updated_by:=auth.uid(); new.updated_at:=now();
  return new;
end $$;
create trigger guard_weekly_goal before insert or update on public.office_weekly_goals for each row execute function public.guard_weekly_goal();
create function public.approve_office_asset(p_asset uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare asset public.office_assets;
begin
  select * into asset from public.office_assets where id=p_asset;
  if not found or not public.is_office_owner(asset.office_id) then raise exception 'الاعتماد للمالك فقط.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(asset.project_id::text,0));
  update public.office_assets set approved=false where project_id=asset.project_id and approved;
  update public.office_assets set approved=true where id=p_asset;
  return p_asset;
end $$;

-- Team files use an independent private bucket; object paths begin with office UUID.
insert into storage.buckets(id,name,public,file_size_limit) values('office-files','office-files',false,20971520)
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
create policy office_files_read on storage.objects for select to authenticated
  using(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid));
create policy office_files_add on storage.objects for insert to authenticated
  with check(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid));
create policy office_files_edit on storage.objects for update to authenticated
  using(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid))
  with check(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid));
create policy office_files_remove on storage.objects for delete to authenticated
  using(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid));

-- Focus and reward records stay private to each user even when linked to a team task.
alter table public.sessions add column office_task_id uuid references public.office_tasks(id) on delete set null;
create function public.start_office_focus(p_task uuid,p_duration_seconds integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); task public.office_tasks; s public.sessions;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into s from public.sessions where id=p_request_id and user_id=u;
  if found then return to_jsonb(s)||jsonb_build_object('server_now',clock_timestamp()); end if;
  select * into task from public.office_tasks where id=p_task;
  if not found or not public.is_office_member(task.office_id) or task.status='done' then raise exception 'المهمة غير متاحة.'; end if;
  if p_duration_seconds not between 60 and 14400 then raise exception 'مدة التركيز بين دقيقة و٢٤٠ دقيقة.'; end if;
  if exists(select 1 from public.sessions where user_id=u and status in ('running','paused')) then raise exception 'عندك جلسة شغالة.'; end if;
  insert into public.sessions(id,user_id,office_task_id,kind,status,duration_seconds,started_at)
    values(p_request_id,u,p_task,'focus','running',p_duration_seconds,clock_timestamp()) returning * into s;
  return to_jsonb(s)||jsonb_build_object('server_now',clock_timestamp());
end $$;
revoke execute on function public.create_office(text,text,text),public.invite_office_member(uuid,text),public.accept_office_invite(uuid),public.revoke_office_invite(uuid),public.remove_office_member(uuid,uuid),public.approve_office_asset(uuid),public.start_office_focus(uuid,integer,uuid) from public,anon;
grant execute on function public.create_office(text,text,text),public.invite_office_member(uuid,text),public.accept_office_invite(uuid),public.revoke_office_invite(uuid),public.remove_office_member(uuid,uuid),public.approve_office_asset(uuid),public.start_office_focus(uuid,integer,uuid) to authenticated;
