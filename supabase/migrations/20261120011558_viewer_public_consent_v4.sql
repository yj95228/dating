-- Match the legacy viewer view to the new disclosure consent version.
create or replace view public.people_public
with (security_invoker = false)
as
select p.id, p.created_at, p.gender, p.year, p.location, p.job, p.height,
  p.ideal_type, p.note, p.status, p.is_direct, p.sort_order
from public.people p
where public.is_admin() or (
  p.status = '활성' and exists (
    select 1 from public.guest_profile_consents c
    where c.person_id = p.id
      and c.management_agreed is true
      and c.management_consent_version = 'guest-management-v1'
      and c.management_consented_at is not null
      and c.deletion_requested_at is null
      and c.decision = 'approved'
      and c.consented_at is not null
      and c.consent_version = 'guest-profile-v4'
      and c.consent_snapshot = jsonb_build_object(
        'gender', p.gender, 'year', p.year, 'height', p.height,
        'location', p.location, 'job', p.job,
        'is_direct', coalesce(p.is_direct, false),
        'public_ideal_type', coalesce(p.ideal_type, ''),
        'public_traits', coalesce(p.note, '')
      )
  )
);
