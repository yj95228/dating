# AGENTS.md

## Project

This is a private blind-date note app built with React 18, TypeScript, Vite, React Router, Supabase, and Vercel.

## Common Commands

- Start dev server: `npm run dev`
- Build for production: `npm run build`
- Type-check only: `npm run typecheck`
- Preview production build: `npm run preview`

## Code Map

- App routing: `src/App.tsx`
- Supabase client: `src/lib/supabase.ts`
- Auth state and auth helpers: `src/hooks/useAuth.ts`
- Main data CRUD/context: `src/hooks/useData.ts`
- Shared types: `src/types/index.ts`
- Shared inline style objects: `src/styles.ts`
- Supabase role/RLS policy SQL: `supabase/role_policies.sql`
- Supabase migrations: `supabase/migrations/`

## Working Rules

- Do not edit `.env` unless the user explicitly asks.
- Do not print secrets, Supabase keys, or environment values in responses.
- Prefer existing app patterns before adding new abstractions.
- Keep UI changes consistent with the current React/Vite app and shared style objects.
- For frontend code changes, run `npm run typecheck` or `npm run build` before finishing when practical.
- When adding or removing `import.meta.env.VITE_*` variables, update `.env.example` and run `npm run docs:check`.
- When changing user-facing features, setup steps, routes, auth behavior, or database shape, update `README.md` in the same change.
- Treat `dist/` as generated output. Do not edit it by hand.
- Preserve user changes in the working tree. Do not revert unrelated files.

## Supabase Rules

- For database/schema/security changes, prefer SQL files or migrations over one-off manual edits.
- New database changes should be added as timestamped SQL files under `supabase/migrations/`.
- Use Supabase MCP for structured database inspection, SQL execution, advisors, docs lookup, and higher-risk changes.
- CLI commands are fine for simple repeated tasks when the project has a clear script for them.
- Keep RLS and role behavior explicit. Changes to auth, roles, or policies should include verification notes.
- After DDL/RLS changes, check Supabase security/performance advisors when available.

## Notes

- Copy `.env.example` to `.env` for local setup, then fill in real Supabase values.
- Some Korean text in existing docs/comments may appear mojibake-encoded. Avoid rewriting those files unless asked or unless the task requires it.
