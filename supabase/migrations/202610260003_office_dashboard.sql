-- Precise, RLS-scoped office snapshot. Lists stay short even when the task table grows.
-- Trigger-only definer functions must not be exposed as RPCs.
revoke execute on function public.assign_asset_version() from public,anon,authenticated;
create function public.office_dashboard(p_office uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare viewer uuid:=auth.uid(); today date:=(now() at time zone 'Asia/Riyadh')::date;
begin
  if viewer is null or not public.is_office_member(p_office) then
    raise exception 'المكتب غير متاح لهذا الحساب.';
  end if;
  return (
    with mine as materialized (
      select t.* from public.office_tasks t
      join public.office_projects p on p.id=t.project_id and p.archived_at is null
      where t.office_id=p_office and t.assignee_id=viewer and t.status<>'done'
    ), team as materialized (
      select t.* from public.office_tasks t
      join public.office_projects p on p.id=t.project_id and p.archived_at is null
      where t.office_id=p_office and t.status<>'done'
    ), actionable as materialized (
      select t.* from team t where t.status='blocked' and
        (public.office_can_manage(p_office) or t.blocked_by=viewer or t.assignee_id=viewer)
    ), decisions as materialized (
      select d.* from public.office_decisions d
      join public.office_projects p on p.id=d.project_id and p.archived_at is null
      where d.office_id=p_office and d.status='pending' and
        (public.office_can_approve(p_office) or d.created_by=viewer)
    )
    select jsonb_build_object(
      'today_count',(select count(*) from mine where due_on=today),
      'overdue_count',(select count(*) from mine where due_on<today),
      'upcoming_count',(select count(*) from mine where due_on>today),
      'undated_count',(select count(*) from mine where due_on is null),
      'blocker_count',(select count(*) from actionable),
      'decision_count',(select count(*) from decisions),
      'today_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from mine where due_on=today order by case priority when 'high' then 0 when 'normal' then 1 else 2 end,created_at limit 5) x),
      'overdue_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from mine where due_on<today order by due_on,case priority when 'high' then 0 when 'normal' then 1 else 2 end limit 4) x),
      'upcoming_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from mine where due_on>today order by due_on,case priority when 'high' then 0 when 'normal' then 1 else 2 end limit 2) x),
      'undated_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from mine where due_on is null order by case priority when 'high' then 0 when 'normal' then 1 else 2 end,created_at limit 3) x),
      'blockers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from actionable order by due_on nulls last,created_at limit 3) x),
      'decisions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from decisions order by due_on nulls last,created_at limit 3) x),
      'next_due',(select to_jsonb(x) from (
        select id,title,due_on,'task'::text as kind from team where due_on>=today
        union all
        select id,name as title,due_on,'project'::text as kind from public.office_projects
        where office_id=p_office and archived_at is null and status<>'done' and due_on>=today
        order by due_on,kind limit 1
      ) x)
    )
  );
end $$;
revoke execute on function public.office_dashboard(uuid) from public,anon;
grant execute on function public.office_dashboard(uuid) to authenticated;
create index office_tasks_open_due on public.office_tasks(office_id,assignee_id,due_on,priority)
  where status<>'done';
