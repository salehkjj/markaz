-- Return unique private focus days, so team screens can calculate lifetime points
-- without downloading every historical session or revealing sessions to coworkers.
create function public.my_focus_days() returns date[] language sql stable set search_path='' as $$
  select coalesce(array_agg(day order by day),'{}'::date[]) from (
    select distinct (completed_at at time zone 'Asia/Riyadh')::date as day
    from public.sessions where user_id=auth.uid() and kind='focus' and status='completed'
  ) saved
$$;
revoke execute on function public.my_focus_days() from public,anon;
grant execute on function public.my_focus_days() to authenticated;
