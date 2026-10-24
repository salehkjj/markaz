-- A member may set only their own displayed name; membership and role stay server-managed.
create function public.set_office_member_name(p_office uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_name is null or char_length(trim(p_name)) not between 1 and 120 then raise exception 'راجع اسمك.'; end if;
  update public.office_members set member_name=trim(p_name)
    where office_id=p_office and user_id=auth.uid();
  if not found then raise exception 'لست عضوًا في المكتب.'; end if;
end $$;
revoke execute on function public.set_office_member_name(uuid,text) from public,anon;
grant execute on function public.set_office_member_name(uuid,text) to authenticated;
