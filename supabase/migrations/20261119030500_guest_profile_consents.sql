-- Only consented profiles can appear in the anonymous matchmaking list.
-- A long-lived per-person capability URL is derived server-side from the secret nonce.
-- Public Data API access to all consent records is denied.
create table if not exists public.guest_profile_consents (
  person_id bigint primary key references public.people(id) on delete cascade,
  secret_nonce uuid not null default gen_random_uuid(),
  decision text not null default 'pending'
    check (decision in ('pending','approved','declined','withdrawn')),
  profile_signature text,
  consent_snapshot jsonb,
  consent_version text,
  consented_at timestamptz,
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  check (decision <> 'approved' or
    (profile_signature is not null and consent_snapshot is not null
      and consent_version is not null and consented_at is not null))
);
alter table public.guest_profile_consents enable row level security;
revoke all on public.guest_profile_consents from public, anon, authenticated;
grant select, insert, update, delete on public.guest_profile_consents to service_role;
create index if not exists guest_profile_consents_status_idx
  on public.guest_profile_consents (decision, consented_at);

comment on table public.guest_profile_consents is
  'Candidate self-approval via an unguessable recipient-specific capability URL; service_role only. Never infer real identity solely from link possession.';
comment on column public.guest_profile_consents.consent_snapshot is
  'Exact fields disclosed and approved at consent time; server checks profile_signature before every public disclosure.';
