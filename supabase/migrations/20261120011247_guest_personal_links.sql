-- Personal-link access for consented candidates and approved visitors.
-- Service-role Edge Functions are the sole API for these private records.
create table if not exists public.guest_referrers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  invite_token_hash text not null unique check (invite_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.guest_access_requests (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null check (char_length(btrim(visitor_name)) between 1 and 40),
  applicant_kind text not null default 'candidate'
    check (applicant_kind in ('candidate','introducer')),
  referrer_id uuid references public.guest_referrers(id) on delete set null,
  referrer_note text check (referrer_note is null or char_length(referrer_note) <= 100),
  token_nonce uuid not null default gen_random_uuid(),
  access_token_hash text not null unique check (access_token_hash ~ '^[0-9a-f]{64}$'),
  ip_fingerprint text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists guest_access_requests_recent_idx
  on public.guest_access_requests(created_at desc);
create index if not exists guest_access_requests_ip_idx
  on public.guest_access_requests(ip_fingerprint,created_at desc);

create table if not exists public.guest_access_passes (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique check (access_token_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid unique references public.guest_access_requests(id) on delete cascade,
  person_id bigint references public.people(id) on delete cascade,
  consent_nonce uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint guest_access_pass_owner check (
    (request_id is not null and person_id is null and consent_nonce is null) or
    (request_id is null and person_id is not null and consent_nonce is not null)
  )
);

create index if not exists guest_access_passes_person_idx
  on public.guest_access_passes(person_id);

alter table public.guest_referrers enable row level security;
alter table public.guest_access_requests enable row level security;
alter table public.guest_access_passes enable row level security;
revoke all on public.guest_referrers from public, anon, authenticated;
revoke all on public.guest_access_requests from public, anon, authenticated;
revoke all on public.guest_access_passes from public, anon, authenticated;
comment on table public.guest_access_passes is 'Revocable, hashed, non-expiring bearer links. Never expose to the public Data API.';
