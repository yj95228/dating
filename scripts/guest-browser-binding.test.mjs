import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../supabase/functions/guest-share/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../supabase/migrations/20261120090000_guest_browser_binding.sql', import.meta.url), 'utf8')
test('only browser credentials authorize browsing and submitting', () => {
  assert.match(source, /const personalPass = async[^]*?devicePass\(db, token\)/)
  assert.match(source, /await personalPass\(admin, payload.accessToken\)/)
  assert.match(source, /visiblePeopleForVisitor\(admin, visitor!\.personId\)/)
  assert.doesNotMatch(source, /\? await linkPass\(admin, payload.accessToken\)/)
})
test('first access and pairing are separate from browse authorization', () => {
  for (const action of ['device-check','device-enroll','device-start','device-verify','device-confirm']) {
    assert.ok(source.includes("'"+action+"'"))
  }
  assert.match(source, /\.is\('used_at', null\)/)
  assert.match(source, /\.gt\('expires_at', new Date\(\)\.toISOString\(\)\)/)
})
test('stored device secrets are protected from public data API', () => {
  assert.match(schema, /guest_access_devices enable row level security/)
  assert.match(schema, /guest_device_pairings enable row level security/)
  assert.match(schema, /revoke all on public.guest_access_devices from public, anon, authenticated/)
  assert.match(schema, /unique index[^]*?guest_access_devices_first_idx/)
})
