import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const server = read('../supabase/functions/guest-share/index.ts')
const app = read('../src/App.tsx')
const nav = read('../src/pages/Layout.tsx')
const page = read('../src/pages/AdminPublicPreviewPage.tsx')
const admin = read('../src/pages/AdminGuestPage.tsx')
const settings = read('../src/pages/SettingsPage.tsx')
const consent = read('../src/components/GuestConsentAdmin.tsx')

test('only verified admin can request preview', () => {
  const authorization = server.indexOf('if (!actorId) return failure(headers, 403')
  const action = server.indexOf("if (payload.action === 'admin-preview')")
  assert.ok(authorization !== -1 && action > authorization)
  const block = server.slice(action, server.indexOf("if (payload.action === 'get-access-status')", action))
  assert.match(block, /approvedPeople\(admin\)/)
  assert.match(block, /publicProfile\(p\)/)
  assert.doesNotMatch(block, /\.from\('people'\)\.select\('\*'\)/)
})

test('route and top navigation are admin-scoped', () => {
  assert.match(app, /role === "admin" && <Route path="public-preview"/)
  assert.match(admin, /navigate\('\/public-preview'\)/)
  assert.doesNotMatch(nav, /to: '\/public-preview', label:/)
})

test('read-only preview does not use a guest token or submit interest requests', () => {
  assert.match(page, /action: 'admin-preview'/)
  assert.doesNotMatch(page, /accessToken|action: 'submit'|dating-guest-personal-v1/)
})

test('admin notification settings belong in profile settings', () => {
  assert.match(nav, /to="\/settings"/)
  assert.match(app, /role === "admin" && <Route path="settings"/)
  assert.match(settings, /action: 'subscribe'/)
  assert.doesNotMatch(admin, /onClick={enablePush}/)
})
test('switching candidates clears stale consent state', () => {
  assert.match(consent, /setState\(null\)/)
})
