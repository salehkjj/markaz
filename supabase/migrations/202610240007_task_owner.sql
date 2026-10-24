-- Every team task has one accountable member. Existing unassigned rows go to the owner.
update public.office_tasks t set assignee_id=o.owner_id from public.offices o
  where t.office_id=o.id and t.assignee_id is null;
alter table public.office_tasks alter column assignee_id set not null;
alter table public.office_projects add column updated_at timestamptz not null default now();
create function public.stamp_office_project() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp(); return new; end $$;
create trigger stamp_office_project before update on public.office_projects for each row execute function public.stamp_office_project();
create or replace function public.remove_office_member(p_office uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  select owner_id into owner from public.offices where id=p_office;
  if owner is null or not public.is_office_owner(p_office) or p_user=owner then raise exception 'إزالة العضو غير متاحة.'; end if;
  update public.office_tasks set assignee_id=owner where office_id=p_office and assignee_id=p_user;
  update public.office_tasks set blocked_by=null where office_id=p_office and blocked_by=p_user;
  delete from public.office_weekly_updates where office_id=p_office and user_id=p_user;
  delete from public.office_members where office_id=p_office and user_id=p_user;
end $$;
