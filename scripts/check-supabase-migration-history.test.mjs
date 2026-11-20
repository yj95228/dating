import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHistory, checkHistory } from './check-supabase-migration-history.mjs'
const sample = `LOCAL      │     REMOTE     │     TIME (UTC)
───────────┼────────────────┼─────────────
20261120011247 │ 20261120011247 │ 2026-11-20
20261120011558 │ 20261120011558 │ 2026-11-20
20261120083756 │ 20261120083756 │ 2026-11-20
20261121120000 │                │ 2026-11-21`
test('read local and remote columns of Supabase migration list', () => {
  assert.deepEqual(parseHistory(sample).map(x => x.remote), [
    '20261120011247', '20261120011558', '20261120083756', '',
  ])
})
test('newer local migrations may be applied after verified history', () => {
  const files = ['20261120011247_guest_personal_links.sql',
    '20261120011558_viewer_public_consent_v4.sql',
    '20261120083756_guest_browser_binding.sql',
    '20261121120000_future.sql']
  assert.deepEqual(checkHistory(files, parseHistory(sample)), ['20261121120000'])
})
test('abort when database contains unknown historical migration versions', () => {
  const files = ['20261120011247_one.sql', '20261120011558_two.sql',
    '20261120083756_three.sql']
  assert.throws(() => checkHistory(files, parseHistory(
    '20261120011247 │ 20261120011247 │ 2026-11-20\n' +
    '               │ 20261120011558 │ 2026-11-20\n' +
    '20261120083756 │ 20261120083756 │ 2026-11-20')),
  /저장소에 없는 운영 버전/)
})
test('abort when local historical versions were never applied', () => {
  const files = ['20261120011247_one.sql', '20261120011558_old.sql',
    '20261120083756_three.sql']
  assert.throws(() => checkHistory(files, parseHistory(
    '20261120011247 │ 20261120011247 │ 2026-11-20\n' +
    '20261120011558 │                │ 2026-11-20\n' +
    '20261120083756 │ 20261120083756 │ 2026-11-20')),
  /적용되지 않은 과거 저장소 버전/)
})
