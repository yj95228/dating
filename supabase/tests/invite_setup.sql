-- Run after the migration on a local/test database. All fixture writes roll back.
begin;
do $$
declare
  fixture_id uuid := gen_random_uuid();
  fixture_email text;
begin
  fixture_email := 'invite-test-' || fixture_id::text || '@example.invalid';
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
    values (fixture_id, fixture_email, '', '{}'::jsonb);
  update auth.users set invited_at = now() where id = fixture_id;
  -- Match Auth.signupVerify: temporary password first, confirmation second.
  update auth.users set encrypted_password = 'random-temporary-password-hash' where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is not null then
    raise exception 'Pending invites must use the normal invite flow';
  end if;
  update auth.users set email_confirmed_at = now() where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is distinct from fixture_id then
    raise exception 'Auth temporary password must not block incomplete invitation recovery';
  end if;
  update auth.users set raw_user_meta_data = '{"password_set":true}'::jsonb where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is distinct from fixture_id then
    raise exception 'User metadata must not determine setup eligibility';
  end if;
  update public.profiles set role = 'admin' where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is not null then
    raise exception 'Admin accounts must never be eligible';
  end if;
  update public.profiles set role = 'viewer' where id = fixture_id;
  update auth.users set invited_at = null where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is not null then
    raise exception 'Accounts without an invitation must never be eligible';
  end if;
  update auth.users set invited_at = now(), banned_until = now() + interval '1 day' where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is not null then
    raise exception 'Banned accounts must never be eligible';
  end if;
  update auth.users set banned_until = null where id = fixture_id;
  update auth.users set encrypted_password = 'user-chosen-password-hash', raw_user_meta_data = '{"password_set":false}'::jsonb where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is not null then
    raise exception 'A real password change must complete setup despite forged metadata';
  end if;
  update auth.users set encrypted_password = '' where id = fixture_id;
  if public.incomplete_invited_viewer_id(fixture_email) is not null then
    raise exception 'Completed setup must never become pending through password/metadata changes';
  end if;
  if has_table_privilege('anon', 'public.invite_setup_state', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.invite_setup_state', 'select,insert,update,delete') then
    raise exception 'Browser roles must not access or forge setup tracking';
  end if;
  if has_function_privilege('anon', 'public.incomplete_invited_viewer_id(text)', 'execute')
    or has_function_privilege('authenticated', 'public.incomplete_invited_viewer_id(text)', 'execute') then
    raise exception 'Browser roles must not inspect Auth setup status';
  end if;
  if not has_function_privilege('service_role', 'public.incomplete_invited_viewer_id(text)', 'execute') then
    raise exception 'The server must have setup eligibility access';
  end if;
end;
$$;
rollback;
