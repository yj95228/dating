import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const entry = read('../src/main.tsx')
const updater = read('../src/lib/pwaUpdates.ts')
const app = read('../src/App.tsx')
const banner = read('../src/components/PwaUpdateNotice.tsx')
const config = read('../vite.config.ts')
const consent = read('../src/components/GuestConsentAdmin.tsx')
const detail = read('../src/pages/PersonDetail.tsx')

test('PWA updates notify the SPA; never reload a form without permission', () => {
  assert.match(config, /registerType: 'prompt'/)
  assert.match(config, /skipWaiting: false/)
  assert.ok(entry.includes("import './lib/pwaUpdates'"))
  assert.match(updater, /registerSW\(\{/)
  assert.match(updater, /onNeedRefresh\(\)/)
  assert.match(updater, /dispatchEvent\(new Event\('dating-app-update'\)\)/)
  assert.doesNotMatch(updater, /window\.location\.reload\(/)
  assert.match(updater, /registration\.update\(\)/)
  assert.match(app, /<PwaUpdateNotice \/>/)
  assert.match(banner, /새 버전으로 새로고침/)
  assert.match(banner, /작성 중인 내용이 있다면 먼저 저장/)
  assert.match(banner, /activatePwaUpdate\(\)/)
  assert.match(updater, /updateSW\(true\)/)
})
test('candidate consent render is bound to ID and avoids stale 86-to-82 transfer', () => {
  assert.match(detail, /<GuestConsentAdmin key=\{person\.id\} personId=\{person\.id\}/)
  assert.ok(consent.includes('loaded?.personId === personId'))
  assert.ok(consent.includes('loaded.profileVersion === profileVersion'))
  assert.match(consent, /setLoaded\(null\)/)
  assert.match(consent, /if \(state\.hasLink && state\.managementAgreed && state\.decision === 'needs-review'\)/)
})
