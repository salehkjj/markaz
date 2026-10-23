-- Supabase grants EXECUTE to anon explicitly on newly created functions.
-- Revoking PUBLIC alone does not remove that privilege.
revoke execute on all functions in schema public from anon;
revoke execute on function public.remove_exam_topic() from authenticated;
