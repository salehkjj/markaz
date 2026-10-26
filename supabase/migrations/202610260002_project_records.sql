-- Shared task notes and project reference versions. Old records remain untouched.
create table public.office_task_comments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  task_id uuid not null references public.office_tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check(char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index office_task_comments_thread on public.office_task_comments(office_id,task_id,created_at desc);
create function public.guard_office_comment() returns trigger language plpgsql set search_path='' as $$
begin
  if new.author_id is distinct from auth.uid() or not exists(
    select 1 from public.office_tasks where id=new.task_id and office_id=new.office_id)
  then raise exception 'التعليق غير متاح لهذه المهمة.'; end if;
  return new;
end $$;
create trigger guard_office_comment before insert on public.office_task_comments
  for each row execute function public.guard_office_comment();
alter table public.office_task_comments enable row level security;
revoke all on public.office_task_comments from anon,authenticated;
grant select,insert on public.office_task_comments to authenticated;
create policy member_read on public.office_task_comments for select to authenticated
  using(public.is_office_member(office_id));
create policy member_add on public.office_task_comments for insert to authenticated
  with check(public.is_office_member(office_id) and author_id=auth.uid());

alter table public.office_decisions add column decider_id uuid;
alter table public.office_decisions add column due_on date;
alter table public.office_decisions add column outcome text not null default '' check(char_length(outcome)<=3000);
alter table public.office_decisions add constraint decision_decider_member
  foreign key(office_id,decider_id) references public.office_members(office_id,user_id) on delete set null(decider_id);

alter table public.office_assets add column reference_id uuid not null default gen_random_uuid();
alter table public.office_assets add column version integer not null default 1 check(version>0);
alter table public.office_assets add column archived_at timestamptz;
alter table public.office_assets add column mime_type text check(char_length(mime_type)<=150);
alter table public.office_assets add column size_bytes bigint check(size_bytes>=0 and size_bytes<=20971520);
drop index public.one_approved_asset_per_project;
create unique index one_approved_asset_per_reference on public.office_assets(project_id,reference_id)
  where approved and archived_at is null;
create unique index office_asset_reference_version on public.office_assets(reference_id,version);
create index office_asset_reference_list on public.office_assets(office_id,reference_id,version desc);

create function public.assign_asset_version() returns trigger language plpgsql security definer set search_path='' as $$
declare existing public.office_assets; next_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.reference_id::text,0));
  select * into existing from public.office_assets where reference_id=new.reference_id limit 1;
  if found and (existing.office_id<>new.office_id or existing.project_id<>new.project_id)
    then raise exception 'نسخ المرجع يجب أن تبقى في مشروع واحد.'; end if;
  select coalesce(max(version),0)+1 into next_version from public.office_assets where reference_id=new.reference_id;
  new.version:=next_version;
  return new;
end $$;
create trigger assign_asset_version before insert on public.office_assets
  for each row execute function public.assign_asset_version();

drop policy member_edit on public.office_assets;
create policy asset_edit on public.office_assets for update to authenticated
  using(public.office_can_manage(office_id) or added_by=auth.uid())
  with check(public.office_can_manage(office_id) or added_by=auth.uid());
create or replace function public.guard_asset() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.office_id<>old.office_id or new.project_id<>old.project_id or
    new.added_by<>old.added_by or new.storage_path is distinct from old.storage_path or
    new.reference_id<>old.reference_id or new.version<>old.version)
    then raise exception 'لا يمكن نقل نسخة المرجع.'; end if;
  if tg_op='INSERT' and new.added_by is distinct from auth.uid() then raise exception 'مضيف الملف غير صحيح.'; end if;
  if (tg_op='INSERT' and new.approved or tg_op='UPDATE' and new.approved is distinct from old.approved) and not public.office_can_approve(new.office_id)
    then raise exception 'اعتماد المرجع للمالك أو المدير فقط.'; end if;
  if tg_op='UPDATE' and new.archived_at is distinct from old.archived_at and
    not (public.office_can_manage(new.office_id) or new.added_by=auth.uid())
    then raise exception 'أرشفة المرجع لمضيفه أو قائد العمل فقط.'; end if;
  if tg_op='UPDATE' and old.approved and new.archived_at is distinct from old.archived_at and
    not public.office_can_approve(new.office_id)
    then raise exception 'المرجع المعتمد يؤرشفه المالك أو المدير فقط.'; end if;
  if new.archived_at is not null then new.approved:=false; end if;
  return new;
end $$;
create or replace function public.approve_office_asset(p_asset uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare asset public.office_assets;
begin
  select * into asset from public.office_assets where id=p_asset;
  if not found or asset.archived_at is not null or not public.office_can_approve(asset.office_id)
    then raise exception 'الاعتماد للمالك أو المدير فقط.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(asset.reference_id::text,0));
  update public.office_assets set approved=false
    where project_id=asset.project_id and reference_id=asset.reference_id and approved;
  update public.office_assets set approved=true where id=p_asset;
  return p_asset;
end $$;

drop policy office_files_remove on storage.objects;
create policy office_files_remove on storage.objects for delete to authenticated
  using(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid)
    and not exists(select 1 from public.office_assets asset where asset.storage_path=storage.objects.name and asset.approved)
    and (public.office_can_manage((storage.foldername(name))[1]::uuid)
      or not exists(select 1 from public.office_assets asset where asset.storage_path=storage.objects.name)
      or exists(select 1 from public.office_assets asset where asset.storage_path=storage.objects.name and asset.added_by=auth.uid())));
