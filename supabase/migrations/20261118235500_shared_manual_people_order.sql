-- Keep the original order when first enabling drag sorting.
alter table public.people add column if not exists sort_order integer;

with initial as (
  select id,
    (row_number() over (
      partition by coalesce(is_direct, false)
      order by created_at asc nulls last, id asc
    ) * 1000)::integer as position
  from public.people
  where sort_order is null
)
update public.people p
set sort_order = initial.position
from initial
where p.id = initial.id;

alter table public.people alter column sort_order set default 2147483647;
alter table public.people alter column sort_order set not null;
create index if not exists people_direct_sort_order_idx
  on public.people (is_direct, sort_order, id);

-- Append only: keep viewer view's previous columns and access model unchanged.
create or replace view public.people_public
with (security_invoker = false)
as
select id, created_at, gender, year, location, job, height,
  ideal_type, note, status, is_direct, sort_order
from public.people;
revoke all on public.people_public from public, anon;
grant select on public.people_public to authenticated;

-- SECURITY INVOKER keeps existing people table's admin-only UPDATE RLS in effect.
create or replace function public.reorder_people_group(
  p_is_direct boolean,
  p_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected integer;
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception '관리자만 순서를 변경할 수 있습니다.' using errcode = '42501';
  end if;
  if p_is_direct is null or p_ids is null or cardinality(p_ids) = 0 then
    raise exception '정렬할 후보를 확인해 주세요.' using errcode = '22023';
  end if;

  perform 1 from public.people
  where coalesce(is_direct, false) = p_is_direct
  for update;

  select count(*) into v_expected from public.people
  where coalesce(is_direct, false) = p_is_direct;

  if v_expected <> cardinality(p_ids)
    or (select count(distinct x.id) from unnest(p_ids) as x(id)) <> cardinality(p_ids)
    or exists (
      select 1 from unnest(p_ids) as x(id)
      left join public.people p on p.id = x.id
        and coalesce(p.is_direct, false) = p_is_direct
      where p.id is null
    ) then
    raise exception '목록이 변경됐어요. 새로고침 후 다시 정렬해 주세요.' using errcode = '22023';
  end if;

  with ranked as (
    select x.id, (x.ordinality * 1000)::integer as position
    from unnest(p_ids) with ordinality as x(id, ordinality)
  )
  update public.people p
  set sort_order = ranked.position
  from ranked
  where p.id = ranked.id and coalesce(p.is_direct, false) = p_is_direct;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception '정렬 저장이 완료되지 않았습니다.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.reorder_people_group(boolean, bigint[]) from public, anon;
grant execute on function public.reorder_people_group(boolean, bigint[]) to authenticated;
