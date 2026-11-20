import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/GuestConsentPage.tsx', import.meta.url), 'utf8')
const server = readFileSync(new URL('../supabase/functions/guest-consent/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20261120130000_candidate_inline_profile_edit.sql', import.meta.url), 'utf8')
const share = readFileSync(new URL('../supabase/functions/guest-share/index.ts', import.meta.url), 'utf8')

test('corrections are only part of a separately confirmed consent decision', () => {
  assert.match(page, /수정한 내용은 아래에서 동의할 때 함께 저장/)
  assert.match(page, /\.\.\.\(editedProfile \? \{ editedProfile \} : \{\}\)/)
  assert.match(server, /body\.editedProfile !== undefined/)
  assert.match(server, /confirmedOwner !== true \|\| body\.useAgreed !== true/)
  assert.match(server, /body\.previewSignature !== await signatureOf\(preview\)/)
  assert.match(server, /body\.managementSignature !== await managementSignature\(person\)/)
  assert.match(server, /admin\.rpc\('submit_guest_profile_decision'/)
})
test('only public text/metrics are editable, and consent plus profile writes are atomic', () => {
  assert.match(server, /const allowed = \['year', 'height', 'location', 'job', 'public_ideal_type', 'public_traits'\]/)
  assert.match(migration, /for update/)
  assert.match(migration, /v_consent\.updated_at is distinct from p_expected_consent_updated_at/)
  assert.match(migration, /update public\.people set/)
  assert.match(migration, /update public\.guest_profile_consents set/)
  assert.match(migration, /revoke all on function public\.submit_guest_profile_decision/)
  assert.match(migration, /to service_role/)
  assert.match(migration, /security invoker/)
  assert.match(share, /consent\.profile_signature === await profileSignature\(p\)/)
})
test('the short page retains detailed disclosures, opt-out and withdrawal', () => {
  assert.match(page, /<details>/)
  assert.match(page, /개인정보 수집·이용 안내 \(필수\)/)
  assert.match(page, /프로필 공개 안내 \(선택\)/)
  assert.match(page, /거부할 수 있지만 주선에 참여할 수 없어요/)
  assert.match(page, /이름·사진을 제외한 프로필을 승인된 방문자/)
  assert.match(page, /동의하지 않기 · 저장 정보 삭제 요청/)
  assert.match(page, /정보 보관도 철회 · 삭제 요청/)
  assert.match(page, /프로필 공개 중단하기/)
  assert.match(page, /setShowDetails\(true\)/)
  assert.match(page, /useState\(false\)/)
})
test('new editable fields never let candidate change admin-only identity or relationships', () => {
  assert.match(server, /Object\.keys\(input\)\.some\(key => !allowed\.includes\(key\)\)/)
  assert.match(page, /성별·관계 구분·이름·사진은 주선자에게 수정 요청/)
  assert.match(migration, /v_management is distinct from p_expected_management/)
  assert.match(migration, /p_new_profile - 'year' - 'height' - 'location' - 'job'/)
})

test('checkboxes only ask for confirmation; repeated disclosure text remains above', () => {
  assert.match(page, /위 프로필이 제 정보임을 확인했어요/)
  assert.match(page, /개인정보 보관·이용에 동의해요 <strong>\(필수\)<\/strong>/)
  assert.match(page, /프로필 공개에 동의해요 <strong>\(선택\)<\/strong>/)
  assert.doesNotMatch(page, /위 안내에 따라 소개팅 연결을 위해 내 정보를 보관하고 이용하는 데 동의해요/)
  assert.doesNotMatch(page, /운영자에게 이용 승인을 받은 방문자와 개인정보 동의를 마친 기존 참여자에게 위 프로필을 보여주는 데 동의해요/)
  assert.match(page, /<details>/)
  assert.match(page, /동의하지 않기 · 저장 정보 삭제 요청/)
  assert.match(page, /onChange=\{e => \{ setUseAgreed\(e.target.checked\); if \(!e.target.checked\) setShareAgreed\(false\) \}\}/)
  assert.match(page, /checked=\{shareAgreed\} disabled=\{!useAgreed\}/)
})
