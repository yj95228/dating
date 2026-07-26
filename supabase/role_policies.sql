-- 목적
-- - 이 앱의 권한 기준은 public.profiles.role 하나로 통일합니다.
-- - admin은 이름/사진을 포함한 people 원본 테이블을 보고 수정할 수 있습니다.
-- - viewer는 이름/사진이 빠진 public.people_public 뷰만 볼 수 있습니다.
-- - viewer는 매칭 기록은 볼 수 없습니다. 매칭 기록은 admin만 봅니다.
-- - 이 SQL은 public.profiles 중 최소 1명이 admin인 것을 확인한 뒤 실행하세요.
--
-- RLS(Row Level Security)는 테이블의 행마다 "이 사용자가 읽거나 수정해도 되는지"를
-- 데이터베이스가 직접 검사하는 보안 규칙입니다. 프론트에서 버튼을 숨기는 것과 별개로,
-- RLS가 있어야 개발자도구나 직접 API 호출로 우회하는 것을 막을 수 있습니다.
--
-- admin 지정 예시:
-- update public.profiles p
-- set role = 'admin'
-- from auth.users u
-- where p.id = u.id
--   and u.email = 'your-admin-email@example.com';

-- 현재 로그인한 사용자의 앱 권한을 가져오는 함수입니다.
-- RLS가 켜져 있어도 profiles를 읽을 수 있도록 security definer로 둡니다.
-- search_path를 public으로 고정해, 함수 안에서 엉뚱한 스키마 객체를 참조하지 않게 합니다.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- RLS 정책을 읽기 쉽게 만들기 위한 admin 판별 함수입니다.
-- profiles row가 없거나 role이 비어 있으면 admin이 아니라 viewer로 취급합니다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), 'viewer') = 'admin'
$$;

-- Supabase Auth에서 새 사용자가 만들어질 때 실행될 트리거 함수입니다.
-- 새 auth.users row가 생기면 같은 id로 public.profiles row를 만들고,
-- 기본 권한은 가장 안전한 viewer로 둡니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 함수들은 앱에서 직접 호출하는 공개 RPC가 아닙니다.
-- handle_new_user는 auth.users 트리거에서만 쓰는 용도라 일반 사용자의 실행 권한을 제거합니다.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;

-- 로그인한 사용자는 RLS 정책 평가에 필요한 role 확인 함수만 실행할 수 있게 합니다.
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 앱 데이터가 들어 있는 테이블들에 RLS를 확실히 켭니다.
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.matches enable row level security;

-- 이름이 다른 과거 정책도 남지 않도록 세 테이블의 기존 정책을 모두 제거합니다.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'people', 'matches')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

-- 기존의 넓은 정책을 제거합니다.
-- 기존 "본인 데이터만" 정책은 실제로는 로그인만 하면 전체 people/matches를 수정할 수 있게 합니다.
drop policy if exists "본인 데이터만" on public.people;
drop policy if exists "본인 데이터만" on public.matches;

-- people 테이블 정책을 새로 만듭니다.
-- people에는 name, photos 같은 민감한 컬럼이 있으므로 admin만 직접 접근하게 합니다.
drop policy if exists people_admin_select on public.people;
drop policy if exists people_admin_insert on public.people;
drop policy if exists people_admin_update on public.people;
drop policy if exists people_admin_delete on public.people;

create policy profiles_self_select
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy people_admin_select
on public.people
for select
to authenticated
using (public.is_admin());

create policy people_admin_insert
on public.people
for insert
to authenticated
with check (public.is_admin());

create policy people_admin_update
on public.people
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy people_admin_delete
on public.people
for delete
to authenticated
using (public.is_admin());

-- matches 테이블 정책을 새로 만듭니다.
-- matches에는 이름/사진이 직접 들어 있지는 않지만, person_id 조합만으로도
-- "누가 누구와 매칭됐는지"를 추론할 수 있습니다.
-- 그래서 조회/생성/결과 변경/삭제 모두 admin만 허용합니다.
drop policy if exists matches_authenticated_select on public.matches;
drop policy if exists matches_admin_select on public.matches;
drop policy if exists matches_admin_insert on public.matches;
drop policy if exists matches_admin_update on public.matches;
drop policy if exists matches_admin_delete on public.matches;

create policy matches_admin_select
on public.matches
for select
to authenticated
using (public.is_admin());

create policy matches_admin_insert
on public.matches
for insert
to authenticated
with check (public.is_admin());

create policy matches_admin_update
on public.matches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy matches_admin_delete
on public.matches
for delete
to authenticated
using (public.is_admin());

-- viewer가 볼 수 있는 안전한 뷰를 정리합니다.
-- people_public은 의도적으로 name, photos 컬럼만 제외합니다.
-- ideal_type, note, is_direct는 현재 소개 요청 판단에 필요한 정보로 보고 유지합니다.
-- 단, note에는 실명, 연락처, SNS, 회사/학교처럼 사람을 특정할 수 있는 내용을
-- 적지 않도록 운영 규칙이나 입력 안내를 나중에 추가하는 것이 좋습니다.
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

grant select on public.people_public to authenticated;

-- 로그인하지 않은 anon 사용자는 앱 데이터를 읽지 못하게 합니다.
revoke all on public.people_public from public, anon;
grant select on public.people_public to authenticated;

revoke all on public.profiles from anon;
revoke all on public.people from anon;
revoke all on public.matches from anon;

-- Supabase advisor 참고:
-- people_public은 security definer view 경고가 뜰 수 있습니다.
-- 이 설계에서는 viewer에게 public.people 직접 SELECT 권한을 주지 않기 위해
-- people_public 뷰를 좁은 공개 창구로 쓰고 있습니다.
-- 나중에 security_invoker 뷰로 바꾸려면 people 테이블 grant/RLS 설계도 함께 다시 봐야 합니다.

-- 다음 확장 TODO:
-- - introduction_requests 테이블을 추가해 viewer가 "이 사람 소개시켜줘" 요청을 남길 수 있게 합니다.
-- - people.created_by를 추가해, 누구나 후보를 올릴 수 있되 본인이 올린 후보만 관리하게 할 수 있습니다.
-- - 사람 등록 시 "소개 목적의 등록/운영자 확인에 동의받았다"는 체크/기록을 남기는 UI를 추가합니다.
