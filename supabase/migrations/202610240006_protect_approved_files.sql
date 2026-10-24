-- Members may upload and read. Only the owner may replace/remove recorded files.
drop policy office_files_edit on storage.objects;
drop policy office_files_remove on storage.objects;
create policy office_files_remove on storage.objects for delete to authenticated
  using(bucket_id='office-files' and public.is_office_member((storage.foldername(name))[1]::uuid)
    and (public.is_office_owner((storage.foldername(name))[1]::uuid)
      or not exists(select 1 from public.office_assets asset where asset.storage_path=storage.objects.name)));
drop policy member_remove on public.office_assets;
create policy owner_remove on public.office_assets for delete to authenticated using(public.is_office_owner(office_id));
