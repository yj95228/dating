-- Distinguish the candidate's consent to internal profile management (name/photos)
-- from optional disclosure of a limited profile to non-member guests.
alter table public.guest_profile_consents
  add column if not exists management_agreed boolean not null default false,
  add column if not exists management_consented_at timestamptz,
  add column if not exists management_consent_version text,
  add column if not exists management_snapshot jsonb,
  add column if not exists deletion_requested_at timestamptz;

-- A prior public-only approval cannot silently imply permission to store names/photos.
-- Existing candidates stay excluded from guest disclosure until new consent is given.

alter table public.guest_profile_consent_events
  add column if not exists management_agreed boolean,
  add column if not exists management_consented_at timestamptz,
  add column if not exists management_consent_version text,
  add column if not exists management_snapshot jsonb,
  add column if not exists deletion_requested_at timestamptz;
alter table public.guest_profile_consent_events
  drop constraint if exists guest_profile_consent_events_event_type_check;
alter table public.guest_profile_consent_events
  add constraint guest_profile_consent_events_event_type_check
  check (event_type in (
    'issued','rotated','approved','declined','withdrawn','management-only','deletion-requested'
  ));

-- The existing audit trigger already runs on each update. Record the distinction
-- in the same transaction and do not copy full names or photo URLs into the audit log.
create or replace function public.audit_guest_profile_consent_change()
returns trigger language plpgsql set search_path = '' as $$
declare event_kind text;
begin
  if tg_op = 'INSERT' then
    event_kind := 'issued';
  elsif old.secret_nonce is distinct from new.secret_nonce then
    event_kind := 'rotated';
  elsif old.deletion_requested_at is distinct from new.deletion_requested_at
      and new.deletion_requested_at is not null then
    event_kind := 'deletion-requested';
  elsif new.management_agreed is true and new.decision = 'declined'
      and (old.management_agreed is distinct from new.management_agreed
       or old.management_consented_at is distinct from new.management_consented_at
       or old.decision is distinct from new.decision) then
    event_kind := 'management-only';
  elsif old.decision is distinct from new.decision
      or old.consented_at is distinct from new.consented_at
      or old.profile_signature is distinct from new.profile_signature
      or old.management_agreed is distinct from new.management_agreed then
    event_kind := new.decision;
  else
    return new;
  end if;

  insert into public.guest_profile_consent_events (
    person_id, event_type, profile_signature, consent_snapshot,
    consent_version, consented_at, decided_at,
    management_agreed, management_consented_at,
    management_consent_version, management_snapshot, deletion_requested_at
  ) values (
    new.person_id, event_kind, new.profile_signature, new.consent_snapshot,
    new.consent_version, new.consented_at, new.decided_at,
    new.management_agreed, new.management_consented_at,
    new.management_consent_version, new.management_snapshot, new.deletion_requested_at
  );
  return new;
end;
$$;
revoke execute on function public.audit_guest_profile_consent_change()
  from public, anon, authenticated;

comment on column public.guest_profile_consents.management_snapshot is
  'Only field labels and presence/count of admin-held details; not the actual name or photo URLs.';
comment on column public.guest_profile_consents.deletion_requested_at is
  'Candidate requested removal of already-held details; admin must handle actual people/Cloudinary deletion.';
