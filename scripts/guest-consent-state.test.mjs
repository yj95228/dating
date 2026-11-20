import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const ts = require('typescript')

const candidateStatus = {
  hasLink: true, public: false, decision: 'needs-review', decidedAt: null,
  managementAgreed: true, deletionRequestedAt: null,
}
const neverConsentedStatus = {
  hasLink: false, public: false, decision: 'pending', decidedAt: null,
  managementAgreed: false, deletionRequestedAt: null,
}
function loadComponent(supabase) {
  const source = readFileSync(new URL('../src/components/GuestConsentAdmin.tsx', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  const mockedRequire = (name) => {
    if (name === '@/lib/supabase') return { supabase }
    if (name === '@/styles') return { S: { card: {}, btnPrimary: {} } }
    return require(name)
  }
  vm.runInNewContext(output, { require: mockedRequire, module, exports: module.exports, Response }, {
    filename: 'GuestConsentAdmin.cjs',
  })
  return module.exports.default
}
const renderedText = tree => JSON.stringify(tree.toJSON())

test('82 shows pending, never the previous candidate\'s reconsent status', async () => {
  const requests = new Map()
  const supabase = { functions: { invoke: (_name, { body }) => new Promise(resolve => {
    requests.set(body.personId, resolve)
  }) } }
  const Component = loadComponent(supabase)
  let tree
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Component, { personId: 86, profileVersion: 'v86' }))
  })
  await renderer.act(async () => requests.get(86)({ data: candidateStatus, error: null }))
  assert.match(renderedText(tree), /재동의 필요/)

  await renderer.act(async () => {
    tree.update(React.createElement(Component, { personId: 82, profileVersion: 'v82' }))
  })
  assert.doesNotMatch(renderedText(tree), /재동의 필요/)
  assert.match(renderedText(tree), /불러오는 중/)

  await renderer.act(async () => requests.get(82)({ data: neverConsentedStatus, error: null }))
  assert.match(renderedText(tree), /동의 대기/)
  assert.match(renderedText(tree), /비공개/)
  assert.doesNotMatch(renderedText(tree), /재동의 필요/)
  tree.unmount()
})

test('a failed status lookup does not revive another person\'s status', async () => {
  const requests = new Map()
  const supabase = { functions: { invoke: (_name, { body }) => new Promise(resolve => {
    requests.set(body.personId, resolve)
  }) } }
  const Component = loadComponent(supabase)
  let tree
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Component, { personId: 86, profileVersion: 'old' }))
  })
  await renderer.act(async () => requests.get(86)({ data: candidateStatus, error: null }))
  await renderer.act(async () => {
    tree.update(React.createElement(Component, { personId: 82, profileVersion: 'new' }))
  })
  await renderer.act(async () => requests.get(82)({ data: null, error: new Error('network') }))
  assert.doesNotMatch(renderedText(tree), /재동의 필요/)
  assert.match(renderedText(tree), /요청이 실패했어요|동의 상태를 확인하지 못했어요/)
  tree.unmount()
})

test('stale status after a profile update cannot overwrite the latest status', async () => {
  const requests = []
  const supabase = { functions: { invoke: (_name, { body }) => new Promise(resolve => {
    requests.push({ personId: body.personId, resolve })
  }) } }
  const Component = loadComponent(supabase)
  let tree
  await renderer.act(async () => {
    tree = renderer.create(React.createElement(Component, { personId: 82, profileVersion: 'first' }))
  })
  await renderer.act(async () => {
    tree.update(React.createElement(Component, { personId: 82, profileVersion: 'changed' }))
  })
  await renderer.act(async () => requests[1].resolve({ data: neverConsentedStatus, error: null }))
  await renderer.act(async () => requests[0].resolve({ data: candidateStatus, error: null }))
  assert.match(renderedText(tree), /동의 대기/)
  assert.doesNotMatch(renderedText(tree), /재동의 필요/)
  tree.unmount()
})
