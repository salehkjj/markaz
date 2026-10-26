-- Expand office roles without changing existing owners or members.
alter table public.office_members drop constraint office_members_role_check;
alter table public.office_members add constraint office_members_role_check
  check(role in ('owner','manager','deputy','member'));

create function public.office_role(p_office uuid) returns text
language sql stable security definer set search_path='' as $$
  select role from public.office_members where office_id=p_office and user_id=auth.uid()
$$;
create function public.office_can_manage(p_office uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.office_role(p_office) in ('owner','manager','deputy'),false)
$$;
create function public.office_can_approve(p_office uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.office_role(p_office) in ('owner','manager'),false)
$$;
revoke execute on function public.office_role(uuid),public.office_can_manage(uuid),public.office_can_approve(uuid) from public,anon;
grant execute on function public.office_role(uuid),public.office_can_manage(uuid),public.office_can_approve(uuid) to authenticated;

-- Project and task permissions are enforced on rows, not only in the UI.
drop policy member_add on public.office_projects;
drop policy member_edit on public.office_projects;
drop policy member_remove on public.office_projects;
create policy project_add on public.office_projects for insert to authenticated
  with check(public.office_can_manage(office_id));
create policy project_edit on public.office_projects for update to authenticated
  using(public.office_can_manage(office_id)) with check(public.office_can_manage(office_id));
create policy project_remove on public.office_projects for delete to authenticated
  using(public.is_office_owner(office_id));
alter table public.office_projects add column archived_at timestamptz;

drop policy member_add on public.office_tasks;
drop policy member_edit on public.office_tasks;
drop policy member_remove on public.office_tasks;
create policy task_add on public.office_tasks for insert to authenticated
  with check(public.office_can_manage(office_id) or (public.is_office_member(office_id) and assignee_id=auth.uid()));
create policy task_edit on public.office_tasks for update to authenticated
  using(public.office_can_manage(office_id) or assignee_id=auth.uid())
  with check(public.office_can_manage(office_id) or assignee_id=auth.uid());
create policy task_remove on public.office_tasks for delete to authenticated
  using(public.is_office_owner(office_id));
create function public.guard_office_task_role() returns trigger language plpgsql set search_path='' as $$
begin
  if not public.office_can_manage(new.office_id) then
    if tg_op='INSERT' then
      if new.assignee_id is distinct from auth.uid() then raise exception 'يمكنك إنشاء مهمة لنفسك فقط.'; end if;
    elsif old.assignee_id is distinct from auth.uid() or
      new.office_id is distinct from old.office_id or new.project_id is distinct from old.project_id or
      new.title is distinct from old.title or new.assignee_id is distinct from old.assignee_id or
      new.due_on is distinct from old.due_on or new.priority is distinct from old.priority or
      new.goal_week_start is distinct from old.goal_week_start or new.created_by is distinct from old.created_by
    then raise exception 'تحديث هذه التفاصيل لقائد العمل فقط.'; end if;
  end if;
  return new;
end $$;
create trigger guard_office_task_role before insert or update on public.office_tasks
  for each row execute function public.guard_office_task_role();

drop policy member_add on public.office_decisions;
drop policy member_edit on public.office_decisions;
drop policy member_remove on public.office_decisions;
create policy decision_add on public.office_decisions for insert to authenticated
  with check(public.is_office_member(office_id));
create policy decision_edit on public.office_decisions for update to authenticated
  using(public.office_can_manage(office_id) or created_by=auth.uid())
  with check(public.office_can_manage(office_id) or created_by=auth.uid());
create policy decision_remove on public.office_decisions for delete to authenticated
  using(public.is_office_owner(office_id));
create function public.guard_office_decision_role() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='approved' and (tg_op='INSERT' or old.status<>'approved') and not public.office_can_approve(new.office_id)
    then raise exception 'اعتماد القرار للمالك أو المدير فقط.'; end if;
  if tg_op='UPDATE' and not public.office_can_manage(new.office_id) and
    (new.office_id is distinct from old.office_id or new.project_id is distinct from old.project_id or
     new.created_by is distinct from old.created_by)
    then raise exception 'تعديل ربط القرار لقائد العمل فقط.'; end if;
  return new;
end $$;
create trigger guard_office_decision_role before insert or update on public.office_decisions
  for each row execute function public.guard_office_decision_role();

drop policy member_add on public.office_weekly_goals;
drop policy member_edit on public.office_weekly_goals;
drop policy member_remove on public.office_weekly_goals;
create policy goal_add on public.office_weekly_goals for insert to authenticated
  with check(public.office_can_manage(office_id));
create policy goal_edit on public.office_weekly_goals for update to authenticated
  using(public.office_can_manage(office_id)) with check(public.office_can_manage(office_id));
create policy goal_remove on public.office_weekly_goals for delete to authenticated
  using(public.is_office_owner(office_id));

-- Existing weekly updates already validate the author in a trigger.
drop policy member_remove on public.office_weekly_updates;
create policy own_update_remove on public.office_weekly_updates for delete to authenticated
  using(user_id=auth.uid());

create or replace function public.guard_asset() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.office_id<>old.office_id or new.added_by<>old.added_by or new.storage_path is distinct from old.storage_path) then raise exception 'لا يمكن نقل الملف.'; end if;
  if tg_op='INSERT' and new.added_by is distinct from auth.uid() then raise exception 'مضيف الملف غير صحيح.'; end if;
  if (tg_op='INSERT' and new.approved or tg_op='UPDATE' and new.approved is distinct from old.approved) and not public.office_can_approve(new.office_id) then raise exception 'اعتماد المرجع للمالك أو المدير فقط.'; end if;
  return new;
end $$;
create or replace function public.guard_approved_asset() returns trigger language plpgsql set search_path='' as $$
begin
  if old.approved and not public.office_can_approve(old.office_id) and
    (new.name is distinct from old.name or new.url is distinct from old.url or
     new.project_id is distinct from old.project_id or new.kind is distinct from old.kind)
  then raise exception 'المرجع المعتمد يعدله المالك أو المدير فقط.'; end if;
  return new;
end $$;
create or replace function public.approve_office_asset(p_asset uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare asset public.office_assets;
begin
  select * into asset from public.office_assets where id=p_asset;
  if not found or not public.office_can_approve(asset.office_id) then raise exception 'الاعتماد للمالك أو المدير فقط.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(asset.project_id::text,0));
  update public.office_assets set approved=false where project_id=asset.project_id and approved;
  update public.office_assets set approved=true where id=p_asset;
  return p_asset;
end $$;

create function public.set_office_member_role(p_office uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_office_owner(p_office) then raise exception 'إدارة الأدوار للمالك فقط.'; end if;
  if p_role not in ('manager','deputy','member') then raise exception 'الدور غير صحيح.'; end if;
  if p_user=(select owner_id from public.offices where id=p_office) then raise exception 'لا يمكن تغيير دور المالك قبل نقل الملكية.'; end if;
  update public.office_members set role=p_role where office_id=p_office and user_id=p_user;
  if not found then raise exception 'العضو غير موجود.'; end if;
end $$;
create function public.transfer_office_ownership(p_office uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare current_owner uuid;
begin
  select owner_id into current_owner from public.offices where id=p_office for update;
  if current_owner is distinct from auth.uid() then raise exception 'نقل الملكية للمالك فقط.'; end if;
  if p_user=current_owner then return; end if;
  if not exists(select 1 from public.office_members where office_id=p_office and user_id=p_user) then raise exception 'اختر عضوًا من المكتب.'; end if;
  update public.office_members set role='manager' where office_id=p_office and user_id=current_owner;
  update public.office_members set role='owner' where office_id=p_office and user_id=p_user;
  update public.offices set owner_id=p_user where id=p_office;
end $$;
revoke execute on function public.set_office_member_role(uuid,uuid,text),public.transfer_office_ownership(uuid,uuid) from public,anon;
grant execute on function public.set_office_member_role(uuid,uuid,text),public.transfer_office_ownership(uuid,uuid) to authenticated;

-- A new member receives an editable neutral label. The invited account chooses its own display name.
create or replace function public.accept_office_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); invitation public.office_invites; recipient text; chosen_name text;
begin
  if u is null then raise exception 'سجّل دخولك أولًا.'; end if;
  select lower(email) into recipient from auth.users where id=u and email_confirmed_at is not null;
  if recipient is null then raise exception 'أكد بريد حسابك أولًا، ثم افتح رابط الدعوة.'; end if;
  select * into invitation from public.office_invites where token_hash=md5(p_token::text) for update;
  if not found then raise exception 'رابط الدعوة غير صحيح أو جُدّد. اطلب الرابط الجديد.'; end if;
  if invitation.revoked_at is not null then raise exception 'ألغيت هذه الدعوة. اطلب رابطًا جديدًا.'; end if;
  if invitation.accepted_at is not null then raise exception 'استُخدمت هذه الدعوة من قبل.'; end if;
  if invitation.expires_at<=now() then raise exception 'انتهت صلاحية الدعوة. اطلب رابطًا جديدًا.'; end if;
  if invitation.email<>recipient then raise exception 'الدعوة لبريد آخر. سجّل الدخول بالبريد الذي خُصص له الرابط.'; end if;
  select nullif(trim(display_name),'') into chosen_name from public.profiles where user_id=u;
  insert into public.office_members(office_id,user_id,role,member_name)
    values(invitation.office_id,u,'member',coalesce(chosen_name,'عضو الفريق')) on conflict(office_id,user_id) do nothing;
  update public.office_invites set accepted_at=now() where id=invitation.id;
  return invitation.office_id;
end $$;
