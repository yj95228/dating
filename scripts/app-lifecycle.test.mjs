import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import * as Router from 'react-router-dom'
import { act, create } from 'react-test-renderer'
import ts from 'typescript'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const deferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

// Render the real App, data provider, Layout, PeoplePage and PersonForm together.
// Only external services, the browser location/storage and host DOM are replaced.
async function mountApp({ storage = new Map(), accountId = 'admin-a', initialRole = 'admin', legacyStorage = new Map() } = {}) {
  const account = { id: accountId, email: 'test@example.test', user_metadata: {} }
  const listeners = new Set()
  const cache = new Map()
  const modalNodes = []
  const pendingQueries = []
  const timers = new Map()
  let role = initialRole, roleError = false, holdData = false, saveError = false, timerId = 0, data
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: account } } }),
      onAuthStateChange: (listener) => {
        listeners.add(listener)
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
      },
      signOut: async () => { for (const listener of listeners) listener('SIGNED_OUT', null) },
    },
    rpc: async () => ({ data: roleError ? null : role, error: roleError ? { message: 'network unavailable' } : null }),
    from: (table) => ({
      select: () => ({
        order: () => {
          if (holdData) {
            const query = deferred()
            pendingQueries.push(query)
            return query.promise
          }
          return Promise.resolve({ data: [], error: null })
        },
      }),
      insert: async () => { assert.equal(table, 'people'); return { error: saveError ? new Error('offline') : null } },
    }),
  }
  const context = vm.createContext({
    URL, URLSearchParams, React,
    window: { location: { href: 'https://example.test/people' } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    sessionStorage: {
      getItem: (key) => legacyStorage.get(key) ?? null,
      setItem: (key, value) => legacyStorage.set(key, value),
      removeItem: (key) => legacyStorage.delete(key),
    },
    console: { ...console, error: (message) => {
      if (!String(message).startsWith('Failed to refresh profile role')) console.error(message)
    } },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId },
    clearTimeout: (id) => timers.delete(id),
  })
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const source = ts.transpileModule(readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const require = (name) => {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === 'react-router-dom') return {
        ...Router,
        BrowserRouter: ({ children }) => React.createElement(Router.MemoryRouter, {
          initialEntries: ['/people'], future: { v7_startTransition: true, v7_relativeSplatPath: true },
        }, children),
      }
      if (name === '@/lib/supabase') return { supabase }
      const base = name.startsWith('@/') ? path.join(src, name.slice(2)) : path.resolve(path.dirname(filename), name)
      const target = ['.ts', '.tsx'].map((extension) => base + extension).find(existsSync)
      assert.ok(target, `Cannot resolve ${name}`)
      return load(target)
    }
    vm.runInContext(`(function(require, module, exports) { ${source}\n})`, context)(require, module, module.exports)
    return module.exports
  }
  const jsxRuntime = await import('react/jsx-runtime')
  const { DataProvider, useData } = load(path.join(src, 'hooks/useData.ts'))
  // Capture the actual context so the test can trigger a background refetch.
  const originalCreateElement = React.createElement
  function CaptureData() { data = useData(); return null }
  function CapturedProvider(props) {
    return originalCreateElement(DataProvider, props,
      originalCreateElement(CaptureData), props.children)
  }
  cache.get(path.join(src, 'hooks/useData.ts')).exports.DataProvider = CapturedProvider
  const App = load(path.join(src, 'App.tsx')).default
  const PersonForm = load(path.join(src, 'components/PersonForm.tsx')).default
  const Modal = load(path.join(src, 'components/Modal.tsx')).default
  let renderer
  const flush = async (action = () => {}) => {
    await act(async () => {
      action()
      // Drain initial getSession, auth timers, role RPC and data effects.
      for (let i = 0; i < 6; i++) {
        await new Promise((resolve) => setImmediate(resolve))
        const pending = [...timers.values()]
        timers.clear()
        for (const fn of pending) fn()
      }
    })
  }
  await flush(() => {
    renderer = create(React.createElement(App), {
      createNodeMock(element) {
        const node = { scrollTop: 0 }
        if (element.props.style?.overflowY === 'auto') modalNodes.push(node)
        return node
      },
    })
  })
  const findName = () => renderer.root.findByProps({ placeholder: '이름 입력 (선택)' })
  return {
    flush, storage,
    setRoleError(value) { roleError = value },
    setRole(value) { role = value },
    setSaveError(value) { saveError = value },
    emit(event = 'SIGNED_IN') {
      for (const listener of [...listeners]) listener(event, { user: account })
    },
    async openForm(name = '작성 중인 테스트 이름') {
      await flush(() => renderer.root.findAllByType('button').find((node) => node.props.children === '+ 인물 추가').props.onClick())
      if (name !== null) await flush(() => findName().props.onChange({ target: { value: name } }))
      return renderer.root.findByType(PersonForm)
    },
    async closeForm() { await flush(() => renderer.root.findByType(Modal).props.onClose()) },
    async saveForm() {
      await flush(() => { void renderer.root.findAllByType('button').find((node) => node.props.children === '저장').props.onClick() })
    },
    async logout() { await flush(() => { void supabase.auth.signOut() }) },
    async scrollForm(scrollTop) {
      await flush(() => {
        modalNodes.at(-1).scrollTop = scrollTop
        renderer.root.findAllByType('div').find((node) => node.props.style?.overflowY === 'auto').props.onScroll({ currentTarget: { scrollTop } })
      })
    },
    get scrollTop() { return modalNodes.at(-1)?.scrollTop },
    get form() { return renderer.root.findByType(PersonForm) },
    get formCount() { return renderer.root.findAllByType(PersonForm).length },
    get name() { return findName().props.value },
    get draftWarning() { return JSON.stringify(renderer.toJSON()).includes('기기 임시 저장을 사용할 수 없어요') },
    get isLoading() { return JSON.stringify(renderer.toJSON()).includes('불러오는 중...') },
    startRefetch() { holdData = true; return data.refetch() },
    finishRefetch(fail = false) {
      holdData = false
      for (const query of pendingQueries.splice(0)) query.resolve({ data: [], error: fail ? new Error('offline') : null })
    },
    async cleanup() { await flush(() => renderer.unmount()) },
  }
}

test('real add form stays mounted across tab return, token refresh, failed role lookup and recovery', async () => {
  const app = await mountApp()
  try {
    const form = await app.openForm()
    for (const failed of [false, true, true, false]) {
      app.setRoleError(failed)
      for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED']) {
        await app.flush(() => app.emit(event))
        assert.equal(app.form, form, 'PersonForm must keep the same React instance')
        assert.equal(app.name, '작성 중인 테스트 이름')
        assert.equal(app.isLoading, false)
      }
    }
    app.setRole('viewer')
    await app.flush(() => app.emit())
    assert.equal(app.formCount, 0, 'a confirmed role change must remove the admin form')
  } finally { await app.cleanup() }
})

test('PWA process restart restores the open add form, values and scroll using only durable storage', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  await first.scrollForm(420)
  await first.cleanup()
  // A completely new module graph, React tree, timers and sessionStorage.
  const restarted = await mountApp({ storage })
  try {
    assert.equal(restarted.formCount, 1)
    assert.equal(restarted.name, '작성 중인 테스트 이름')
    assert.equal(restarted.scrollTop, 420)
  } finally { await restarted.cleanup() }
})

test('explicit close keeps a draft but does not automatically reopen it on restart', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  await first.closeForm()
  await first.cleanup()
  const restarted = await mountApp({ storage })
  try {
    assert.equal(restarted.formCount, 0)
    assert.equal(JSON.parse(storage.get('person_add_draft:v1:admin-a')).form.name, '작성 중인 테스트 이름')
  } finally { await restarted.cleanup() }
})

test('successful save clears the draft and prevents reopening after restart', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  await first.saveForm()
  assert.equal(first.formCount, 0)
  assert.equal(storage.has('person_add_draft:v1:admin-a'), false)
  await first.cleanup()
  const restarted = await mountApp({ storage })
  try { assert.equal(restarted.formCount, 0) } finally { await restarted.cleanup() }
})

test('failed save preserves the open draft across a PWA restart', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  first.setSaveError(true)
  await first.saveForm()
  assert.equal(first.formCount, 1)
  await first.cleanup()
  const restarted = await mountApp({ storage })
  try {
    assert.equal(restarted.formCount, 1)
    assert.equal(restarted.name, '작성 중인 테스트 이름')
  } finally { await restarted.cleanup() }
})

test('another account cannot restore the previous account draft', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  await first.cleanup()
  const other = await mountApp({ storage, accountId: 'admin-b' })
  try { assert.equal(other.formCount, 0) } finally { await other.cleanup() }
})

test('logout removes the draft so signing back in starts with a closed form', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  await first.logout()
  assert.equal(storage.has('person_add_draft:v1:admin-a'), false)
  await first.cleanup()
  const restarted = await mountApp({ storage })
  try { assert.equal(restarted.formCount, 0) } finally { await restarted.cleanup() }
})

test('confirmed viewer permissions clear a stored admin draft before it can open', async () => {
  const storage = new Map()
  const first = await mountApp({ storage })
  await first.openForm()
  await first.cleanup()
  const viewer = await mountApp({ storage, initialRole: 'viewer' })
  try {
    assert.equal(viewer.formCount, 0)
    assert.equal(storage.has('person_add_draft:v1:admin-a'), false)
  } finally { await viewer.cleanup() }
})

test('malformed durable storage does not break the page', async () => {
  const storage = new Map([['person_add_draft:v1:admin-a', '{broken']])
  const app = await mountApp({ storage })
  try {
    assert.equal(app.formCount, 0)
    await app.openForm()
    assert.equal(app.name, '작성 중인 테스트 이름')
  } finally { await app.cleanup() }
})

test('a legacy session draft migrates without losing the existing input', async () => {
  const storage = new Map()
  const legacyStorage = new Map([['person_form_draft', JSON.stringify({
    name: '이전 버전에서 작성한 이름', year: null, location: null, job: null, height: null,
    ideal_type: null, note: '기존 메모', gender: 'male', photos: [], status: '활성', is_direct: true,
  })]])
  const app = await mountApp({ storage, legacyStorage })
  try {
    await app.openForm(null)
    assert.equal(app.name, '이전 버전에서 작성한 이름')
    assert.equal(legacyStorage.has('person_form_draft'), false)
    assert.equal(JSON.parse(storage.get('person_add_draft:v1:admin-a')).form.note, '기존 메모')
  } finally { await app.cleanup() }
})

test('unavailable device storage shows a warning and still allows writing', async () => {
  const storage = { get() { throw new Error('blocked') }, set() { throw new Error('blocked') }, delete() {} }
  const app = await mountApp({ storage })
  try {
    await app.openForm()
    assert.equal(app.name, '작성 중인 테스트 이름')
    assert.equal(app.draftWarning, true)
  } finally { await app.cleanup() }
})

test('real add form stays mounted while data refresh is pending, fails and recovers', async () => {
  const app = await mountApp()
  try {
    const form = await app.openForm()
    for (const failed of [false, true, false]) {
      let request
      await app.flush(() => { request = app.startRefetch() })
      assert.equal(app.form, form)
      assert.equal(app.isLoading, false)
      await app.flush(() => app.finishRefetch(failed))
      await request
      assert.equal(app.form, form)
      assert.equal(app.name, '작성 중인 테스트 이름')
    }
  } finally { await app.cleanup() }
})
