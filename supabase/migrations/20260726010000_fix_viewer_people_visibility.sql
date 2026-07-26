-- people_public is the intentionally restricted projection for viewers.
-- Explicitly use the view owner's permissions so the admin-only people RLS
-- does not turn the viewer result into an empty list.
create or replace view public.people_public
with (security_invoker = false)
as
select
  id,
  created_at,
  gender,
  year,
  location,
  job,
  height,
  ideal_type,
  note,
  status,
  is_direct
from public.people;

revoke all on public.people_public from public, anon;
grant select on public.people_public to authenticated;
