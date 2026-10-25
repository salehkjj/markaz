-- Invitation tokens remain one-way hashes. Renewal atomically replaces the hash,
-- so neither the old link nor a previously accepted invitation can be reused.
create function public.renew_office_invite(p_invite uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation public.office_invites; token uuid:=gen_random_uuid();
begin
  select * into invitation from public.office_invites where id=p_invite for update;
  if not found or not public.is_office_owner(invitation.office_id) then raise exception 'الدعوة غير متاحة.'; end if;
  if invitation.accepted_at is not null then raise exception 'استُخدمت الدعوة. أنشئ دعوة جديدة عند الحاجة.'; end if;
  update public.office_invites set token_hash=md5(token::text),expires_at=now()+interval '7 days',revoked_at=null
    where id=p_invite returning * into invitation;
  return jsonb_build_object('id',invitation.id,'token',token,'expires_at',invitation.expires_at);
end $$;
revoke execute on function public.renew_office_invite(uuid) from public,anon;
grant execute on function public.renew_office_invite(uuid) to authenticated;

create or replace function public.accept_office_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); invitation public.office_invites; recipient text;
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
  insert into public.office_members(office_id,user_id,role,member_name)
    values(invitation.office_id,u,'member',split_part(recipient,'@',1)) on conflict(office_id,user_id) do nothing;
  update public.office_invites set accepted_at=now() where id=invitation.id;
  return invitation.office_id;
end $$;
