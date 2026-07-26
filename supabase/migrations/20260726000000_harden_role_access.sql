-- Remove any older policies so a broadly permissive policy cannot remain active.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'people', 'matches')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.matches enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), 'viewer') = 'admin'
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

create policy profiles_self_select
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy people_admin_select
on public.people
for select
to authenticated
using (public.is_admin());

create policy people_admin_insert
on public.people
for insert
to authenticated
with check (public.is_admin());

create policy people_admin_update
on public.people
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy people_admin_delete
on public.people
for delete
to authenticated
using (public.is_admin());

create policy matches_admin_select
on public.matches
for select
to authenticated
using (public.is_admin());

create policy matches_admin_insert
on public.matches
for insert
to authenticated
with check (public.is_admin());

create policy matches_admin_update
on public.matches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy matches_admin_delete
on public.matches
for delete
to authenticated
using (public.is_admin());

-- Viewers intentionally see every person field except name and photos.
create or replace view public.people_public as
select
  id,
  created_at,
  gender,
  year,
  location,
  job,
  height,
  ideal_type,
  note,
  status,
  is_direct
from public.people;

revoke all on public.people_public from public, anon;
grant select on public.people_public to authenticated;

-- RLS is the main protection; these grants add defense in depth for signed-out users.
revoke all on public.profiles from anon;
revoke all on public.people from anon;
revoke all on public.matches from anon;
