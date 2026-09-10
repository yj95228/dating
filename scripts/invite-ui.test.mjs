import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { act, create } from 'react-test-renderer'
import ts from 'typescript'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const inviteUrl = 'https://auth.example.test/auth/v1/verify?token=test-only&type=invite'
const deferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

function harness({ href = 'https://app.example.test/auth/callback', canManage = true,
  invoke = async () => ({ data: { inviteUrl }, error: null }), session = null, exchangeError = null,
  sessionError = false, clipboardFails = false, verifyError = null, verifyResult } = {}) {
  const cache = new Map(), timers = new Map(), navigations = [], copies = [], requests = []
  const listeners = new Set()
  const verifications = []
  let selected = 0, renderer, timerId = 0, identityReads = 0, rewrittenUrl
  const supabase = {
    functions: { invoke: async (...args) => { requests.push(args); return invoke(...args) } },
    auth: {
      verifyOtp: async (params) => {
        verifications.push(params)
        return verifyResult ?? { data: { session }, error: verifyError }
      },
      getSession: async () => {
        identityReads++
        if (sessionError) throw new Error('offline')
        return { data: { session }, error: null }
      },
      exchangeCodeForSession: async () => ({ error: exchangeError }),
      onAuthStateChange: (listener) => {
        listeners.add(listener)
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
      },
    },
  }
  const navigate = (...args) => navigations.push(args)
  const context = vm.createContext({
    URL, URLSearchParams, Response,
    window: {
      location: { href },
      history: { replaceState: (_state, _title, url) => { rewrittenUrl = url } },
      setTimeout: (fn) => { timers.set(++timerId, fn); return timerId },
      clearTimeout: (id) => timers.delete(id),
    },
    navigator: { clipboard: { writeText: async (value) => {
      if (clipboardFails) throw new Error('clipboard denied')
      copies.push(value)
    } } },
    console,
  })
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const require = (name) => {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === '@/lib/supabase') return { supabase }
      if (name === '@/hooks/useData') return { useData: () => ({ matches: [], canManage, loading: false, initialized: true }) }
      if (name === 'react-router-dom') return {
        useNavigate: () => navigate,
        useLocation: () => ({ pathname: '/people' }),
        Outlet: () => null,
        Link: ({ children, to }) => React.createElement('a', { href: to }, children),
        NavLink: ({ children, to }) => React.createElement('a', { href: to }, children),
      }
      const base = name.startsWith('@/') ? path.join(src, name.slice(2)) : path.resolve(path.dirname(filename), name)
      const target = ['.ts', '.tsx'].map((extension) => base + extension).find(existsSync)
      assert.ok(target, `Cannot resolve ${name}`)
      return load(target)
    }
    vm.runInContext(`(function(require, module, exports) { ${output}\n})`, context)(require, module, module.exports)
    return module.exports
  }
  const flush = async (action = () => {}) => {
    await act(async () => { await action(); await new Promise((resolve) => setImmediate(resolve)) })
  }
  return {
    flush, requests, navigations, copies, verifications,
    async mount(file = 'components/InviteModal.tsx', props = {}) {
      const Component = load(path.join(src, file)).default
      await flush(() => {
        renderer = create(React.createElement(Component, { onClose: () => renderer.unmount(), ...props }), {
          createNodeMock: () => ({ focus() {}, select() { selected++ }, scrollTop: 0 }),
        })
      })
    },
    get root() { return renderer.root },
    get text() { return JSON.stringify(renderer.toJSON()) },
    get selected() { return selected },
    get identityReads() { return identityReads },
    get rewrittenUrl() { return rewrittenUrl },
    button(label) { return renderer.root.findAllByType('button').find((node) => node.props.children === label) },
    async enter(value = ' Guest@Example.Test ') {
      await flush(() => renderer.root.findByProps({ id: 'invite-email' }).props.onChange({ target: { value } }))
    },
    async submit() { await flush(() => { void renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }) }) },
    async timers() { await flush(async () => { for (const fn of timers.values()) await fn(); timers.clear() }) },
    async emit(event, value) { await flush(() => { for (const listener of listeners) listener(event, value) }) },
    async cleanup() { await flush(() => renderer.unmount()) },
  }
}

test('invitation landing and preview do not consume tokens or reuse an existing session', async () => {
  const h = harness({ href: 'https://app.example.test/auth/invite#token_hash=test-only', session: { user: { id: 'already-signed-in' } } })
  await h.mount('pages/AcceptInvitePage.tsx')
  await h.timers()
  assert.equal(h.verifications.length, 0)
  assert.equal(h.identityReads, 0)
  assert.equal(h.navigations.length, 0)
  assert.ok(h.button('초대 수락'))
  await h.cleanup()
  await h.mount('pages/AcceptInvitePage.tsx')
  assert.equal(h.verifications.length, 0, 'remount/StrictMode must not exchange a token')
  await h.cleanup()
})

test('explicit acceptance waits for the new session then opens password setup and scrubs the hash', async () => {
  const pending = deferred()
  const h = harness({ href: 'https://app.example.test/auth/invite#token_hash=test-only', verifyResult: pending.promise })
  await h.mount('pages/AcceptInvitePage.tsx')
  const accept = h.button('초대 수락').props.onClick
  await h.flush(() => { void accept(); void accept() })
  assert.equal(h.verifications.length, 1)
  assert.equal(h.verifications[0].type, 'invite')
  assert.equal(h.verifications[0].token_hash, 'test-only')
  assert.equal(h.navigations.length, 0)
  await h.flush(() => pending.resolve({ data: { session: { user: { id: 'invitee' } } }, error: null }))
  assert.equal(h.navigations[0][0], '/set-password')
  assert.equal(h.rewrittenUrl, '/auth/invite')
  await h.cleanup()
})

test('a consumed invitation cannot use a pre-existing session to open password setup', async () => {
  const h = harness({ href: 'https://app.example.test/auth/invite#token_hash=used', session: { user: { id: 'existing' } }, verifyError: { code: 'otp_expired' } })
  await h.mount('pages/AcceptInvitePage.tsx')
  await h.flush(() => h.button('초대 수락').props.onClick())
  assert.equal(h.navigations.length, 0)
  assert.match(h.text, /이미 수락/)
  await h.cleanup()
})

test('landing without the complete invite hash provides instructions and never verifies', async () => {
  const h = harness({ href: 'https://app.example.test/auth/invite' })
  await h.mount('pages/AcceptInvitePage.tsx')
  assert.match(h.text, /초대 링크 전체/)
  assert.equal(h.verifications.length, 0)
  assert.equal(h.navigations.length, 0)
  await h.cleanup()
})

test('an eligible setup link requires an explicit click before recovery verification', async () => {
  const h = harness({ href: 'https://app.example.test/auth/invite#token_hash=setup-only&type=recovery', session: { user: { id: 'invitee' } } })
  await h.mount('pages/AcceptInvitePage.tsx')
  assert.equal(h.verifications.length, 0)
  await h.flush(() => h.button('설정 이어가기').props.onClick())
  assert.equal(h.verifications[0].type, 'recovery')
  assert.equal(h.navigations[0][0], '/set-password')
  await h.cleanup()
})

test('create/copy normalizes email, clears stale links on edit and forgets links after close', async () => {
  const h = harness()
  await h.mount()
  await h.enter()
  await h.submit()
  assert.equal(h.requests[0][0], 'create-invite')
  assert.equal(h.requests[0][1].body.email, 'guest@example.test')
  assert.equal(h.root.findByProps({ id: 'invite-link' }).props.value, inviteUrl)
  await h.flush(() => h.button('링크 복사').props.onClick())
  assert.deepEqual(h.copies, [inviteUrl])
  assert.match(h.text, /초대 링크를 복사했어요/)
  await h.enter('another@example.test')
  assert.equal(h.root.findAllByProps({ id: 'invite-link' }).length, 0)
  await h.submit()
  await h.flush(() => h.button('×').props.onClick())
  await h.mount()
  assert.equal(h.root.findByProps({ id: 'invite-email' }).props.value, '')
  assert.equal(h.root.findAllByProps({ id: 'invite-link' }).length, 0)
  await h.cleanup()
})

test('double submit issues one request and a response after close cannot restore the link', async () => {
  const pending = deferred()
  const h = harness({ invoke: () => pending.promise })
  await h.mount()
  await h.enter()
  await h.submit()
  await h.submit()
  assert.equal(h.requests.length, 1)
  assert.equal(h.root.findByProps({ id: 'invite-email' }).props.disabled, true)
  await h.flush(() => h.button('×').props.onClick())
  await h.mount()
  await h.flush(() => pending.resolve({ data: { inviteUrl }, error: null }))
  assert.equal(h.root.findAllByProps({ id: 'invite-link' }).length, 0)
  await h.cleanup()
})

test('clipboard denial selects the visible readonly URL for manual copying', async () => {
  const h = harness({ clipboardFails: true })
  await h.mount()
  await h.enter()
  await h.submit()
  await h.flush(() => h.button('링크 복사').props.onClick())
  assert.ok(h.selected > 0)
  assert.equal(h.root.findByProps({ id: 'invite-link' }).props.readOnly, true)
  assert.match(h.text, /직접 선택해 복사/)
  await h.cleanup()
})

for (const [status, code, text] of [[401, 'unauthorized', /다시 로그인/], [403, 'forbidden', /관리자만/], [409, 'already_registered', /이미 가입된/], [503, 'role_check_failed', /권한을 확인하지/]]) {
  test(`HTTP ${status} shows a Korean error and no link`, async () => {
    const h = harness({ invoke: async () => ({ data: null, error: { context: new Response(JSON.stringify({ code }), { status }) } }) })
    await h.mount()
    await h.enter()
    await h.submit()
    assert.match(h.text, text)
    assert.equal(h.root.findAllByProps({ id: 'invite-link' }).length, 0)
    await h.cleanup()
  })
}

test('invalid email never calls the function and a thrown network error allows retry', async () => {
  const h = harness({ invoke: async () => { throw new Error('private failure') } })
  await h.mount()
  await h.enter('invalid')
  await h.submit()
  assert.equal(h.requests.length, 0)
  assert.match(h.text, /올바른 이메일/)
  await h.enter()
  await h.submit()
  assert.match(h.text, /초대 링크를 만들지 못했어요/)
  assert.equal(h.button('초대 링크 만들기').props.disabled, false)
  await h.cleanup()
})

for (const canManage of [true, false]) {
  test(`profile menu invite visibility for admin=${canManage}`, async () => {
    const h = harness({ canManage })
    await h.mount('pages/Layout.tsx', { user: { email: 'test@example.test' }, onSignOut() {} })
    await h.flush(() => h.button('T').props.onClick())
    assert.equal(Boolean(h.button('사용자 초대')), canManage)
    if (canManage) {
      await h.flush(() => h.button('사용자 초대').props.onClick())
      assert.equal(h.root.findAllByProps({ id: 'invite-email' }).length, 1)
    }
    await h.cleanup()
  })
}

for (const suffix of ['#error=access_denied&error_code=otp_expired', '?error=access_denied&error_description=used']) {
  test(`invalid/used invite ${suffix} never redirects an existing session to password setup`, async () => {
    const h = harness({ href: `https://app.example.test/auth/callback${suffix}`, session: { user: { id: 'existing' } } })
    await h.mount('pages/AuthCallback.tsx')
    assert.match(h.text, /새 초대 링크를 요청/)
    assert.equal(h.identityReads, 0)
    assert.equal(h.navigations.length, 0)
    assert.equal(h.rewrittenUrl, '/auth/callback?error=invalid_link')
    await h.cleanup()
  })
}

for (const options of [
  { href: 'https://app.example.test/auth/callback?code=invalid', exchangeError: new Error('expired') },
  { href: 'https://app.example.test/auth/callback#type=invite' },
  { sessionError: true },
]) {
  test(`exchange/missing session failure shows a retry instruction: ${JSON.stringify(options)}`, async () => {
    const h = harness(options)
    await h.mount('pages/AuthCallback.tsx')
    await h.timers()
    assert.match(h.text, /새 초대 링크를 요청/)
    assert.equal(h.navigations.length, 0)
    await h.cleanup()
  })
}

for (const type of ['invite', 'recovery']) {
  test(`valid ${type} session continues to password setup only once`, async () => {
    const session = { user: { id: 'guest', invited_at: '2026-01-01', user_metadata: {} } }
    const h = harness({ href: `https://app.example.test/auth/callback?next=/set-password#type=${type}`, session })
    await h.mount('pages/AuthCallback.tsx')
    await h.emit('SIGNED_IN', session)
    assert.equal(h.navigations.length, 1)
    assert.equal(h.navigations[0][0], '/set-password')
    await h.cleanup()
  })
}
