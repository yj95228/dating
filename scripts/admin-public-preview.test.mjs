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
const detail = read('../src/pages/PersonDetail.tsx')

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
  assert.match(detail, /<GuestConsentAdmin key={person.id}/)
})

test('account dropdown aligns actions and closes on outside pointer or Escape', () => {
  assert.match(nav, /accountMenuActionStyle/)
  assert.match(nav, /textAlign: 'center'/)
  assert.match(nav, /width: '100%'/)
  assert.match(nav, /document\.addEventListener\('pointerdown', closeOnOutside\)/)
  assert.match(nav, /document\.addEventListener\('keydown', closeOnEscape\)/)
  assert.match(nav, /profileMenuRef\.current\?\.contains\(target\)/)
  assert.match(nav, /aria-expanded={showProfileMenu}/)
  assert.doesNotMatch(nav, /백드롭 \(메뉴 바깥 클릭 시 닫힘\)/)
})

test('preview explains unavailable Supabase action without blaming Vercel Preview', () => {
  assert.match(page, /data\.error\.includes\('알 수 없는 요청'\)/)
  assert.match(page, /Supabase 서버에 배포되지 않았어요/)
})
