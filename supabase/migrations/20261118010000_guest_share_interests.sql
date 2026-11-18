-- Guest browsing and interest requests are deliberately separate from the existing viewer view.
-- Anonymous clients NEVER receive grants on people, people_public or these tables.
-- A server-side Edge Function validates unguessable share tokens and projects approved fields only.
create table if not exists public.guest_share_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  recipient_label text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint guest_share_label_length check (char_length(recipient_label) <= 80),
  constraint guest_share_token_hash check (char_length(token_hash) = 64)
);

create table if not exists public.guest_approved_people (
  person_id bigint primary key references public.people(id) on delete cascade,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now()
);

create table if not exists public.guest_interest_requests (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.guest_share_links(id) on delete cascade,
  nickname text not null,
  applicant_kind text not null check (applicant_kind in ('candidate', 'introducer')),
  applicant_person_id bigint references public.people(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'checking', 'connected', 'closed')),
  created_at timestamptz not null default now(),
  constraint guest_nickname_length check (char_length(btrim(nickname)) between 1 and 30)
);

create table if not exists public.guest_interest_choices (
  request_id uuid not null references public.guest_interest_requests(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete cascade,
  primary key (request_id, person_id)
);

create table if not exists public.guest_push_subscriptions (
  endpoint text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  constraint guest_push_endpoint_length check (char_length(endpoint) <= 2048)
);

create index if not exists guest_interest_link_created_idx on public.guest_interest_requests(link_id, created_at desc);
create index if not exists guest_interest_created_idx on public.guest_interest_requests(created_at desc);
create index if not exists guest_push_owner_idx on public.guest_push_subscriptions(owner_id);

alter table public.guest_share_links enable row level security;
alter table public.guest_approved_people enable row level security;
alter table public.guest_interest_requests enable row level security;
alter table public.guest_interest_choices enable row level security;
alter table public.guest_push_subscriptions enable row level security;

revoke all on public.guest_share_links, public.guest_approved_people,
  public.guest_interest_requests, public.guest_interest_choices,
  public.guest_push_subscriptions from public, anon, authenticated;

grant select, update on public.guest_share_links to authenticated;
grant select, insert, delete on public.guest_approved_people to authenticated;
grant select, update on public.guest_interest_requests to authenticated;
grant select on public.guest_interest_choices to authenticated;

create policy guest_share_admin_select on public.guest_share_links
  for select to authenticated using (public.is_admin());
create policy guest_share_admin_update on public.guest_share_links
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy guest_approval_admin_select on public.guest_approved_people
  for select to authenticated using (public.is_admin());
create policy guest_approval_admin_insert on public.guest_approved_people
  for insert to authenticated with check (
    public.is_admin() and confirmed_by = auth.uid()
  );
create policy guest_approval_admin_delete on public.guest_approved_people
  for delete to authenticated using (public.is_admin());

create policy guest_interest_admin_select on public.guest_interest_requests
  for select to authenticated using (public.is_admin());
create policy guest_interest_admin_update on public.guest_interest_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy guest_choices_admin_select on public.guest_interest_choices
  for select to authenticated using (public.is_admin());

-- No client policy or grant is provided for push subscriptions.
-- Supabase service_role (Edge Function) manages these after verifying admin JWTs.
