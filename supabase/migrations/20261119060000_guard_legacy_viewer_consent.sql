-- Gate legacy authenticated viewer reads with the same candidate opt-in
-- used for guest browsing. Earlier people_public view exposed all active people
-- regardless of optional public-profile consent.
-- Keep admins able to inspect every candidate while authenticated viewers
-- only see explicitly approved, unchanged public profile snapshots.
create or replace view public.people_public as
select p.id, p.created_at, p.gender, p.year, p.location, p.job,
       p.height, p.ideal_type, p.note, p.status, p.is_direct, p.sort_order
from public.people as p
where public.is_admin()
   or (
      p.status = '활성'
      and exists (
        select 1
        from public.guest_profile_consents as c
        where c.person_id = p.id
          and c.management_agreed is true
          and c.management_consent_version = 'guest-management-v1'
          and c.management_consented_at is not null
          and c.deletion_requested_at is null
          and c.decision = 'approved'
          and c.consented_at is not null
          and c.consent_version = 'guest-profile-v3'
          and c.consent_snapshot = jsonb_build_object(
            'gender', p.gender,
            'year', p.year,
            'height', p.height,
            'location', p.location,
            'job', p.job,
            'is_direct', coalesce(p.is_direct, false),
            'public_ideal_type', coalesce(p.ideal_type, ''),
            'public_traits', coalesce(p.note, '')
          )
      )
   );
-- This view intentionally reads the service-only consent table as its owner.
-- Restrict its output with the predicates above and prevent unsafe filters
-- from being pushed beneath the consent filter.
alter view public.people_public set (security_barrier = true);
revoke all on public.people_public from anon;
revoke all on public.people_public from authenticated;
grant select on public.people_public to authenticated;
grant select on public.people_public to service_role;
comment on view public.people_public is
  'Legacy viewer compatibility: approved active, unchanged profiles only. Admins can access all candidates.';
