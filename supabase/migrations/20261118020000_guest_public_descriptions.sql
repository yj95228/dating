-- Public guest-facing descriptions are curated independently of private admin notes.
-- They are visible ONLY via the guest-share Edge Function for approved active candidates.
create table if not exists public.guest_profile_descriptions (
  person_id bigint primary key references public.people(id) on delete cascade,
  public_ideal_type text not null default '',
  public_traits text not null default '',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint public_ideal_length check (char_length(public_ideal_type) <= 500),
  constraint public_traits_length check (char_length(public_traits) <= 500)
);

alter table public.guest_profile_descriptions enable row level security;
revoke all on public.guest_profile_descriptions from public, anon, authenticated;
grant select, insert, update, delete on public.guest_profile_descriptions to authenticated;

create policy guest_descriptions_admin_select on public.guest_profile_descriptions
  for select to authenticated using (public.is_admin());
create policy guest_descriptions_admin_insert on public.guest_profile_descriptions
  for insert to authenticated with check (
    public.is_admin() and updated_by = auth.uid()
  );
create policy guest_descriptions_admin_update on public.guest_profile_descriptions
  for update to authenticated using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());
create policy guest_descriptions_admin_delete on public.guest_profile_descriptions
  for delete to authenticated using (public.is_admin());
