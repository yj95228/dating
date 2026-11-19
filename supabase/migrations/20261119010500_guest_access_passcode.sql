-- Common guest access code. Only the service-role Edge Function can read these
-- records; no anonymous/authenticated Data API permissions are granted.
create table if not exists public.guest_access_settings (
  id boolean primary key default true check (id = true),
  code_salt text not null check (length(code_salt) = 32),
  code_hash text not null check (length(code_hash) = 64),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.guest_access_settings enable row level security;
revoke all on public.guest_access_settings from public, anon, authenticated;
grant select, insert, update, delete on public.guest_access_settings to service_role;

create table if not exists public.guest_access_attempts (
  fingerprint text primary key check (length(fingerprint) = 64),
  failures integer not null default 0 check (failures >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.guest_access_attempts enable row level security;
revoke all on public.guest_access_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.guest_access_attempts to service_role;

comment on table public.guest_access_settings is 'Service-role-only salted PBKDF2 guest passcode and session generation';
comment on table public.guest_access_attempts is 'Service-role-only hashed IP login attempt throttling; periodically prune stale entries';
