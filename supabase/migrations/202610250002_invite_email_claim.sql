-- A trusted mail function may obtain a recipient only for a currently valid
-- invitation owned by its signed-in caller. The link token is never stored raw.
alter table public.office_invites add column email_attempts integer not null default 0;
alter table public.office_invites add column last_email_attempt_at timestamptz;
create function public.claim_office_invite_email(p_invite uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation public.office_invites; office_name text;
begin
 select * into invitation from public.office_invites where id=p_invite for update;
 if not found or not public.is_office_owner(invitation.office_id) or invitation.token_hash<>md5(p_token::text) then raise exception 'رابط الدعوة غير متاح للإرسال.'; end if;
 if invitation.revoked_at is not null or invitation.accepted_at is not null or invitation.expires_at<=now() then raise exception 'الدعوة لم تعد صالحة. جدّد الرابط أولًا.'; end if;
 if invitation.email_attempts>=5 then raise exception 'بلغت هذه الدعوة حد الإرسال. جدّد الرابط إذا لزم.'; end if;
 if invitation.last_email_attempt_at>now()-interval '60 seconds' then raise exception 'انتظر دقيقة قبل إعادة الإرسال.'; end if;
 update public.office_invites set email_attempts=email_attempts+1,last_email_attempt_at=now() where id=p_invite;
 select name into office_name from public.offices where id=invitation.office_id;
 return jsonb_build_object('email',invitation.email,'office',office_name);
end $$;
revoke execute on function public.claim_office_invite_email(uuid,uuid) from public,anon;
grant execute on function public.claim_office_invite_email(uuid,uuid) to authenticated;
