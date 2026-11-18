-- A single durable common share link replaces per-recipient links.
-- Keep old links valid until the administrator explicitly creates the common link.
-- The Edge Function revokes legacy links only after successfully creating the replacement.
alter table public.guest_share_links
  add column if not exists is_common boolean not null default false;

alter table public.guest_share_links
  alter column expires_at drop not null;

-- At most one live common link, with revoked links retained for interest-request history.
create unique index if not exists guest_share_one_active_common
  on public.guest_share_links (is_common)
  where is_common = true and revoked_at is null;

-- Only non-common legacy links may have an expiration date.
alter table public.guest_share_links
  add constraint guest_common_no_expiry check (not is_common or expires_at is null);

-- Existing table RLS remains admin-only; never grant public access.
