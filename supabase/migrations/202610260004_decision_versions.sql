-- Pending decision edits use optimistic concurrency; approved records remain immutable.
alter table public.office_decisions add column updated_at timestamptz not null default now();
create function public.guard_decision_version() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='approved' and nullif(trim(new.outcome),'') is null then
    raise exception 'اكتب نتيجة القرار قبل اعتماده.';
  end if;
  if tg_op='UPDATE' then
    if new.created_at is distinct from old.created_at then raise exception 'تاريخ إنشاء القرار ثابت.'; end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;
create trigger guard_decision_version before insert or update on public.office_decisions
  for each row execute function public.guard_decision_version();
revoke execute on function public.guard_decision_version() from public,anon,authenticated;
