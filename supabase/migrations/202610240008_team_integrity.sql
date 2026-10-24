-- Approved references and decisions retain their meaning after the team trusts them.
create function public.guard_approved_asset() returns trigger language plpgsql set search_path='' as $$
begin
  if old.approved and not public.is_office_owner(old.office_id) and
    (new.name is distinct from old.name or new.url is distinct from old.url or
     new.project_id is distinct from old.project_id or new.kind is distinct from old.kind)
  then raise exception 'المرجع المعتمد يعدله المالك فقط.'; end if;
  return new;
end $$;
create trigger guard_approved_asset before update on public.office_assets
  for each row execute function public.guard_approved_asset();
create function public.guard_approved_decision() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='approved' then raise exception 'القرار المعتمد محفوظ. أضف قرارًا جديدًا للتعديل.'; end if;
  return coalesce(new,old);
end $$;
create trigger guard_approved_decision before update or delete on public.office_decisions
  for each row execute function public.guard_approved_decision();

create index office_tasks_by_project on public.office_tasks(office_id,project_id);
create index office_tasks_by_goal on public.office_tasks(office_id,goal_week_start);
create index office_decisions_by_project on public.office_decisions(office_id,project_id);
create index sessions_office_task on public.sessions(office_task_id);
create index session_closures_recent on public.session_closures(user_id,created_at desc);
create index offices_by_owner on public.offices(owner_id);
