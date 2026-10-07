-- Profile feature: add phone, avatar_url and a safe update RPC.

-- 1. New columns on public.users
alter table public.users
  add column if not exists phone text,
  add column if not exists avatar_url text;

-- 2. Security-definer RPC so authenticated users can update their own
--    name and phone without a blanket UPDATE policy on users.
create or replace function public.update_user_profile(
  p_name text,
  p_phone text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(p_name)) = 0 then
    raise exception 'Name cannot be empty';
  end if;

  update public.users
     set name       = trim(p_name),
         phone      = p_phone,
         updated_at = now()
   where id = auth.uid();
end;
$$;

-- Allow any authenticated user to call the RPC.
grant execute on function public.update_user_profile(text, text) to authenticated;

-- 3. Avatars storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder.
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/replace their own avatar.
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read for avatars (bucket is public).
create policy "Anyone can read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
