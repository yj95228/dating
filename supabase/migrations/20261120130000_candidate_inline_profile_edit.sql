-- Inline candidate corrections and the final consent decision must be atomic.
-- Called only from guest-consent after the personal HMAC link is verified.
create or replace function public.submit_guest_profile_decision(
  p_person_id bigint,
  p_nonce uuid,
  p_expected_profile jsonb,
  p_expected_management jsonb,
  p_expected_consent_updated_at timestamptz,
  p_new_profile jsonb,
  p_decision text,
  p_profile_signature text,
  p_consent_version text,
  p_management_version text,
  p_management_summary jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_person public.people%rowtype;
  v_consent public.guest_profile_consents%rowtype;
  v_profile jsonb;
  v_management jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_decision not in ('approved', 'declined')
     or p_consent_version is distinct from 'guest-profile-v4'
     or p_management_version is distinct from 'guest-management-v1'
     or jsonb_typeof(p_new_profile) is distinct from 'object'
     or (p_decision = 'approved') is distinct from (p_profile_signature is not null)
  then return false; end if;

  -- Lock both rows. Concurrent manager changes, withdrawal, or stale requests
  -- must not be applied using the previously displayed screen.
  select * into v_person from public.people where id = p_person_id for update;
  if not found then return false; end if;
  select * into v_consent from public.guest_profile_consents
    where person_id = p_person_id for update;
  if not found or v_consent.secret_nonce is distinct from p_nonce
     or v_consent.updated_at is distinct from p_expected_consent_updated_at
     or v_consent.deletion_requested_at is not null
  then return false; end if;

  v_profile := jsonb_build_object(
    'gender', v_person.gender, 'year', v_person.year,
    'height', v_person.height::double precision,
    'location', v_person.location, 'job', v_person.job,
    'is_direct', coalesce(v_person.is_direct, false),
    'public_ideal_type', coalesce(v_person.ideal_type,''),
    'public_traits', coalesce(v_person.note,'')
  );
  v_management := jsonb_build_object(
    'name', v_person.name, 'photos', v_person.photos,
    'gender', v_person.gender, 'year', v_person.year,
    'height', v_person.height::double precision,
    'location', v_person.location, 'job', v_person.job,
    'is_direct', coalesce(v_person.is_direct,false),
    'public_ideal_type', coalesce(v_person.ideal_type,''),
    'public_traits', coalesce(v_person.note,''), 'status', v_person.status
  );
  if v_profile is distinct from p_expected_profile
     or v_management is distinct from p_expected_management
     or (p_new_profile - 'year' - 'height' - 'location' - 'job'
         - 'public_ideal_type' - 'public_traits')
       is distinct from
       (v_profile - 'year' - 'height' - 'location' - 'job'
         - 'public_ideal_type' - 'public_traits')
     or jsonb_typeof(p_new_profile->'public_ideal_type') is distinct from 'string'
     or jsonb_typeof(p_new_profile->'public_traits') is distinct from 'string'
  then return false; end if;

  update public.people set
    year = p_new_profile->>'year',
    height = (p_new_profile->>'height')::numeric,
    location = p_new_profile->>'location',
    job = p_new_profile->>'job',
    ideal_type = p_new_profile->>'public_ideal_type',
    note = p_new_profile->>'public_traits'
  where id = p_person_id;

  update public.guest_profile_consents set
    management_agreed = true,
    management_consented_at = v_now,
    management_consent_version = p_management_version,
    management_snapshot = p_management_summary,
    deletion_requested_at = null,
    decision = p_decision,
    profile_signature = p_profile_signature,
    consent_snapshot = case when p_decision = 'approved' then p_new_profile else null end,
    consent_version = p_consent_version,
    consented_at = case when p_decision = 'approved' then v_now else null end,
    decided_at = v_now,
    updated_at = v_now
  where person_id = p_person_id;

  return true;
end;
$$;
-- The REST endpoint must never be callable with a visitor's anon/JWT key.
revoke all on function public.submit_guest_profile_decision(
  bigint,uuid,jsonb,jsonb,timestamptz,jsonb,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.submit_guest_profile_decision(
  bigint,uuid,jsonb,jsonb,timestamptz,jsonb,text,text,text,text,jsonb
) to service_role;
