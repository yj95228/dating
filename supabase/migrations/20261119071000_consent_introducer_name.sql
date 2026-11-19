-- Identify the person who introduced an indirect match, without claiming
-- that the intermediary is the owner/controller of the profile database.
alter table public.guest_profile_consents
  add column if not exists introducer_name text;
alter table public.guest_profile_consents
  drop constraint if exists guest_profile_consents_introducer_name_length;
alter table public.guest_profile_consents
  add constraint guest_profile_consents_introducer_name_length
  check (introducer_name is null or
    (char_length(introducer_name) between 1 and 40 and introducer_name = btrim(introducer_name)));
comment on column public.guest_profile_consents.introducer_name is
  'Trusted introduction contact name/nickname shown only in the personal consent link, never in guest profiles. Actual data controller remains the app operator.';
