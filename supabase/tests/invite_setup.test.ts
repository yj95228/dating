import { PGlite } from 'npm:@electric-sql/pglite@0.3.14'

Deno.test('invite recovery SQL enforces password, invitation, role and caller privileges', async () => {
  // In-memory Postgres: no production connection, Auth API or persistent users.
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, encrypted_password text,
        invited_at timestamptz, email_confirmed_at timestamptz,
        banned_until timestamptz, raw_user_meta_data jsonb
      );
      create table public.profiles (id uuid primary key references auth.users(id), role text);
      create function public.handle_new_user() returns trigger language plpgsql as $$
        begin insert into public.profiles (id, role) values (new.id, 'viewer'); return new; end;
      $$;
      create trigger on_auth_user_created after insert on auth.users
        for each row execute function public.handle_new_user();
    `)
    await db.exec(`insert into auth.users (id, email, encrypted_password, invited_at, email_confirmed_at)
      values ('00000000-0000-0000-0000-000000000001', 'historical@example.invalid', 'historical-hash', now(), now());`)
    const migration = await Deno.readTextFile(new URL('../migrations/20260910000000_allow_incomplete_invite_setup.sql', import.meta.url))
    await db.exec(migration)
    // Reapplying must not reset completed/previously classified accounts.
    await db.exec(migration)
    const historical = await db.query<{ id: string | null }>("select public.incomplete_invited_viewer_id('historical@example.invalid') as id")
    if (historical.rows[0].id !== null) throw new Error('Historical hashes require individual review; never assume unfinished setup')
    await db.exec(await Deno.readTextFile(new URL('./invite_setup.sql', import.meta.url)))
    const remaining = await db.query<{ count: number }>('select count(*)::int as count from auth.users')
    if (remaining.rows[0].count !== 1) throw new Error('SQL fixtures must roll back')
  } finally {
    await db.close()
  }
})
