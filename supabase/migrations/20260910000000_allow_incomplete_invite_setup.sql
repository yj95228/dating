-- Auth assigns a random temporary password while accepting an invitation.
-- Track later password changes in server-owned state, not user metadata.
begin;

create table if not exists public.invite_setup_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_set_at timestamptz
);
alter table public.invite_setup_state enable row level security;
revoke all on public.invite_setup_state from public, anon, authenticated;
grant select on public.invite_setup_state to service_role;

create or replace function public.track_invite_password_setup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_at is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.invite_setup_state(user_id, password_set_at)
      values (new.id, case when coalesce(new.encrypted_password, '') <> '' then now() end)
      on conflict (user_id) do nothing;
    return new;
  end if;

  if old.invited_at is null then
    insert into public.invite_setup_state(user_id, password_set_at)
      values (new.id, case when coalesce(old.encrypted_password, '') <> '' then now() end)
      on conflict (user_id) do nothing;
  end if;

  if coalesce(old.encrypted_password, '') <> coalesce(new.encrypted_password, '')
    and not (
      old.email_confirmed_at is null and new.email_confirmed_at is null
      and coalesce(old.encrypted_password, '') = ''
      and coalesce(new.encrypted_password, '') <> ''
    ) then
    insert into public.invite_setup_state(user_id, password_set_at) values (new.id, now())
      on conflict (user_id) do update
      set password_set_at = coalesce(public.invite_setup_state.password_set_at, excluded.password_set_at);
  end if;
  return new;
end;
$$;

revoke all on function public.track_invite_password_setup() from public, anon, authenticated;
drop trigger if exists track_invite_password_setup on auth.users;
create trigger track_invite_password_setup
  after insert or update of encrypted_password, invited_at on auth.users
  for each row execute function public.track_invite_password_setup();

-- Historical non-empty hashes cannot reliably distinguish temporary passwords
-- from real passwords. Treat them as complete until individually reviewed.
insert into public.invite_setup_state(user_id, password_set_at)
  select id, case when coalesce(encrypted_password, '') <> '' then now() end
  from auth.users where invited_at is not null
  on conflict (user_id) do nothing;

create or replace function public.incomplete_invited_viewer_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  join public.profiles p on p.id = u.id
  join public.invite_setup_state s on s.user_id = u.id
  where lower(u.email) = lower(trim(p_email))
    and u.invited_at is not null
    and u.email_confirmed_at is not null
    and s.password_set_at is null
    and p.role = 'viewer'
    and (u.banned_until is null or u.banned_until <= now())
  limit 1
$$;

revoke all on function public.incomplete_invited_viewer_id(text) from public, anon, authenticated;
grant execute on function public.incomplete_invited_viewer_id(text) to service_role;

comment on function public.incomplete_invited_viewer_id(text) is
  'Server-only: accepted, non-banned viewer invite without a tracked user password change. Returns no password or Auth profile data.';

commit;
