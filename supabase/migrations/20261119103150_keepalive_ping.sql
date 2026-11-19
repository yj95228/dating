-- Anonymous, read-only probe used by the scheduled low-traffic monitor.
-- The function does not read or return any application records.
create or replace function public.keepalive_ping()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select true;
$$;
revoke all on function public.keepalive_ping() from public, anon, authenticated;
grant execute on function public.keepalive_ping() to anon;
comment on function public.keepalive_ping() is
  'Low-cost DB activity probe for scheduled monitoring; no private data access.';
