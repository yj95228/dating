import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hideMatchedProfiles } from '../supabase/functions/guest-share/match-visibility.ts'

const people = [11, 22, 33, 44].map(id => ({ id }))
const matches = [
  { male_id: 11, female_id: 22 }, // previously failed
  { male_id: 33, female_id: 44 }, // previously successful
]

test('previous matches disappear mutually, while unrelated profiles remain', () => {
  assert.deepEqual(hideMatchedProfiles(people, 11, matches).map(p => p.id), [33, 44])
  assert.deepEqual(hideMatchedProfiles(people, 22, matches).map(p => p.id), [33, 44])
  assert.deepEqual(hideMatchedProfiles(people, 33, matches).map(p => p.id), [11, 22])
  assert.deepEqual(hideMatchedProfiles(people, 44, matches).map(p => p.id), [11, 22])
})

test('own profile disappears even without any prior matches', () => {
  assert.deepEqual(hideMatchedProfiles(people, 11, []).map(p => p.id), [22, 33, 44])
})

test('unknown visitor is not incorrectly mapped by nickname', () => {
  assert.deepEqual(hideMatchedProfiles(people, null, matches).map(p => p.id), [11, 22, 33, 44])
})

test('an unrelated match row never hides another person', () => {
  assert.deepEqual(hideMatchedProfiles(people, 11, [
    { male_id: 33, female_id: 44 },
  ]).map(p => p.id), [22, 33, 44])
})

test('both browse and submission validate visibility on the server', () => {
  const source = readFileSync(new URL('../supabase/functions/guest-share/index.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(payload\.action === 'browse'\)[\s\S]*?visiblePeopleForVisitor\(admin, visitor!\.personId\)/)
  assert.match(source, /if \(payload\.action === 'submit'\)[\s\S]*?visiblePeopleForVisitor\(admin, visitor!\.personId\)/)
  assert.match(source, /if \(error\) throw error\s+return hideMatchedProfiles\(/)
})
