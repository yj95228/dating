-- Preserve consent evidence even after a later withdrawal or profile update.
-- Entries contain only the publicly disclosed fields, never internal names or photos.
create table if not exists public.guest_profile_consent_events (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people(id) on delete cascade,
  event_type text not null check (event_type in ('issued','rotated','approved','declined','withdrawn')),
  profile_signature text,
  consent_snapshot jsonb,
  consent_version text,
  consented_at timestamptz,
  decided_at timestamptz,
  recorded_at timestamptz not null default now()
);
create index if not exists guest_profile_consent_events_person_created_idx
  on public.guest_profile_consent_events(person_id,recorded_at desc);
alter table public.guest_profile_consent_events enable row level security;
revoke all on public.guest_profile_consent_events from public, anon, authenticated;
grant select,insert on public.guest_profile_consent_events to service_role;

create or replace function public.audit_guest_profile_consent_change()
returns trigger language plpgsql set search_path = '' as $$
declare event_kind text;
begin
  if tg_op = 'INSERT' then
    event_kind := 'issued';
  elsif old.secret_nonce is distinct from new.secret_nonce then
    event_kind := 'rotated';
  elsif old.decision is distinct from new.decision
      or old.consented_at is distinct from new.consented_at
      or old.profile_signature is distinct from new.profile_signature then
    event_kind := new.decision;
  else
    return new;
  end if;

  insert into public.guest_profile_consent_events
    (person_id,event_type,profile_signature,consent_snapshot,consent_version,consented_at,decided_at)
  values
    (new.person_id,event_kind,new.profile_signature,new.consent_snapshot,new.consent_version,new.consented_at,new.decided_at);
  return new;
end;
$$;
revoke execute on function public.audit_guest_profile_consent_change()
  from public, anon, authenticated;
drop trigger if exists guest_profile_consent_audit_trigger on public.guest_profile_consents;
create trigger guest_profile_consent_audit_trigger
after insert or update on public.guest_profile_consents
for each row execute function public.audit_guest_profile_consent_change();

comment on table public.guest_profile_consent_events is
  'Service-role only, append-only evidence for online candidate profile disclosure decisions.';
