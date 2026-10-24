-- A blocked task must explain what is needed before the team can act.
alter table public.office_tasks add constraint blocked_task_needs_reason
  check(status<>'blocked' or char_length(trim(blocker_reason))>0);
