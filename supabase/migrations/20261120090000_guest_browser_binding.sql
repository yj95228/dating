-- Browser-scoped guest access and one-time new-browser pairing.
-- Only the service-role Edge Function may read or write these tables.
create table if not exists public.guest_access_devices (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.guest_access_passes(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- Prevent simultaneous first-open requests from both claiming the same link.
create unique index if not exists guest_access_devices_first_idx
  on public.guest_access_devices(pass_id) where is_primary = true;
create index if not exists guest_access_devices_pass_idx
  on public.guest_access_devices(pass_id);
create table if not exists public.guest_device_pairings (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.guest_access_passes(id) on delete cascade,
  device_token_hash text not null check (device_token_hash ~ '^[0-9a-f]{64}$'),
  approval_code_hash text not null check (approval_code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists guest_device_pairings_pass_idx
  on public.guest_device_pairings(pass_id,expires_at desc);
alter table public.guest_access_devices enable row level security;
alter table public.guest_device_pairings enable row level security;
revoke all on public.guest_access_devices from public, anon, authenticated;
revoke all on public.guest_device_pairings from public, anon, authenticated;
comment on table public.guest_access_devices is 'Device secrets are hashed and only checked by Edge Functions; a bearer personal link cannot browse directly.';
comment on table public.guest_device_pairings is 'Short-lived one-time pairing codes for linking an additional browser.';
