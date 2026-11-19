-- Reverse the intermediary-name collection introduced in the previous deployed
-- migration. No independent intermediary identity is necessary for consent.
-- Original historical migration stays recorded; this migration undoes it.
alter table public.guest_profile_consents
  drop column if exists introducer_name;
