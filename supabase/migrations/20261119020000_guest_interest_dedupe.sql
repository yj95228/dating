-- Add a nullable fingerprint so already deployed clients continue to work.
-- Uniqueness applies only when the browser supplies a generated visitor UUID.
alter table public.guest_interest_requests
  add column if not exists submission_fingerprint text;

create unique index if not exists guest_interest_submission_fingerprint_uniq
  on public.guest_interest_requests (submission_fingerprint)
  where submission_fingerprint is not null;

comment on column public.guest_interest_requests.submission_fingerprint is
  'Server-side HMAC of link, anonymous browser UUID, nickname, kind and sorted choices. Used solely to reject exact repeat submissions.';
