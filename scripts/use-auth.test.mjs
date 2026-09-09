import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the hook's auth lifecycle without a live Supabase account or browser.
// React state/effects and timers are controlled here; DOM behavior is not simulated.
const source = ts.transpileModule(
  readFileSync(new URL('../src/hooks/useAuth.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const user = (id = 'a', metadata = {}) => ({ id, user_metadata: metadata })
const session = (value) => value ? { user: value } : null
const tick = () => new Promise((resolve) => setImmediate(resolve))

function harness(url = 'https://example.test/people') {
  const initial = deferred()
  const states = []
  const updates = []
  const requests = []
  const timers = new Map()
  const logs = []
  let effect, callback, cleanup, timerId = 0, unsubscribed = 0
  const location = { href: url }
  const supabase = {
    auth: {
      getSession: () => initial.promise,
      onAuthStateChange: (next) => {
        callback = next
        return { data: { subscription: { unsubscribe: () => { unsubscribed++ } } } }
      },
      signOut: async () => callback('SIGNED_OUT', null),
    },
    rpc: (name) => {
      assert.equal(name, 'current_user_role')
      const request = deferred()
      requests.push(request)
      return request.promise
    },
  }
  const context = {
    exports: {}, URL, URLSearchParams, window: { location },
    console: { error: (...args) => logs.push(args) },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      if (name === '@/lib/supabase') return { supabase }
      if (name === '@/lib/personDraft') return { clearPersonDraft: () => {} }
      assert.equal(name, 'react')
      return {
        useState: (value) => {
          const index = states.length
          states.push(value)
          return [value, (next) => {
            states[index] = next
            updates.push({ index, value: next })
          }]
        },
        useEffect: (fn) => { effect = fn },
      }
    },
  }
  vm.runInNewContext(source, context)
  context.exports.useAuth()
  cleanup = effect()
  return {
    initial, requests, updates, logs, location,
    get state() { return { user: states[0], role: states[1], loading: states[2] } },
    get unsubscribed() { return unsubscribed },
    emit(event, value) { return callback(event, session(value)) },
    async runTimers() {
      const pending = [...timers.values()]
      timers.clear()
      for (const fn of pending) fn()
      await tick()
    },
    async login(value = user(), role = 'admin') {
      this.emit('SIGNED_IN', value)
      await this.runTimers()
      requests.at(-1).resolve({ data: role, error: null })
      await tick()
      updates.length = 0
    },
    cleanup() { cleanup() },
    restartEffect() { cleanup(); cleanup = effect() },
  }
}

test('initial session blocks the app until the role is loaded', async () => {
  const h = harness()
  assert.equal(h.state.loading, true)
  h.initial.resolve({ data: { session: session(user()) } })
  await tick()
  await h.runTimers()
  assert.equal(h.state.loading, true)
  h.requests[0].resolve({ data: 'admin', error: null })
  await tick()
  assert.deepEqual(h.state, { user: user(), role: 'admin', loading: false })
  h.cleanup()
})

test('repeated tab-return and refresh events never reset an established screen', async () => {
  const h = harness()
  await h.login()
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED']) {
    const updated = user('a', { gender: 'female' })
    h.emit(event, updated)
    assert.deepEqual(h.state, { user: h.state.user, role: 'admin', loading: false })
    await h.runTimers()
    h.requests.at(-1).resolve({ data: 'admin', error: null })
    await tick()
    assert.equal(h.state.user, updated)
  }
  assert.equal(h.updates.some(({ index, value }) => index === 2 && value === true), false)
  assert.equal(h.updates.some(({ index, value }) => index === 1 && value === 'viewer'), false)
  h.cleanup()
})

test('account switch hides the previous account immediately', async () => {
  const h = harness()
  await h.login()
  h.emit('SIGNED_IN', user('b'))
  assert.deepEqual(h.state, { user: null, role: 'viewer', loading: true })
  await h.runTimers()
  h.requests.at(-1).resolve({ data: 'viewer', error: null })
  await tick()
  assert.deepEqual(h.state, { user: user('b'), role: 'viewer', loading: false })
  h.cleanup()
})

test('logout invalidates an in-flight role request before another timer runs', async () => {
  const h = harness()
  await h.login()
  h.emit('TOKEN_REFRESHED', user())
  await h.runTimers()
  h.emit('SIGNED_OUT', null)
  assert.deepEqual(h.state, { user: null, role: 'viewer', loading: false })
  h.requests.at(-1).resolve({ data: 'admin', error: null })
  await tick()
  assert.deepEqual(h.state, { user: null, role: 'viewer', loading: false })
  h.cleanup()
})

test('only the newest auth event can apply its role or metadata', async () => {
  const h = harness()
  await h.login()
  h.emit('TOKEN_REFRESHED', user())
  await h.runTimers()
  const stale = h.requests.at(-1)
  const updated = user('a', { gender: 'female' })
  h.emit('USER_UPDATED', updated)
  stale.resolve({ data: 'viewer', error: null })
  await tick()
  assert.equal(h.state.role, 'admin')
  await h.runTimers()
  h.requests.at(-1).resolve({ data: 'admin', error: null })
  await tick()
  assert.equal(h.state.user, updated)
  h.cleanup()
})

for (const mode of ['demoted']) {
  test(`role recheck restricts permissions when ${mode}`, async () => {
    const h = harness()
    await h.login()
    h.emit('SIGNED_IN', user())
    await h.runTimers()
    const request = h.requests.at(-1)
    if (mode === 'rejected') request.reject(new Error('offline'))
    else request.resolve({ data: mode === 'demoted' ? 'viewer' : 'admin', error: mode === 'rpc-error' ? { message: 'failed' } : null })
    await tick()
    assert.equal(h.state.role, 'viewer')
    assert.equal(h.state.loading, false)
    h.cleanup()
  })
}

for (const mode of ['rpc-error', 'rejected']) {
  test(`temporary role lookup failure keeps the current screen: ${mode}`, async () => {
    const h = harness()
    await h.login()
    h.emit('SIGNED_IN', user())
    await h.runTimers()
    const request = h.requests.at(-1)
    if (mode === 'rejected') request.reject(new Error('offline'))
    else request.resolve({ data: null, error: { message: 'failed' } })
    await tick()
    assert.equal(h.state.role, 'admin')
    assert.equal(h.state.loading, false)
    h.cleanup()
  })
}

test('a new account never inherits cached admin permissions if role lookup fails', async () => {
  const h = harness()
  await h.login()
  h.emit('SIGNED_IN', user('b'))
  await h.runTimers()
  h.requests.at(-1).reject(new Error('offline'))
  await tick()
  assert.deepEqual(h.state, { user: user('b'), role: 'viewer', loading: false })
  h.cleanup()
})

test('late initial-session lookup cannot undo logout', async () => {
  const h = harness()
  h.emit('SIGNED_OUT', null)
  h.initial.resolve({ data: { session: session(user()) } })
  await tick()
  await h.runTimers()
  assert.equal(h.requests.length, 0)
  assert.deepEqual(h.state, { user: null, role: 'viewer', loading: false })
  h.cleanup()
})

test('failed initial session exits loading safely', async () => {
  const h = harness()
  h.initial.reject(new Error('offline'))
  await tick()
  assert.deepEqual(h.state, { user: null, role: 'viewer', loading: false })
  h.cleanup()
})

test('cleanup cancels scheduled work and ignores late callbacks and initial lookup', async () => {
  const h = harness()
  h.emit('SIGNED_IN', user())
  h.cleanup()
  const count = h.updates.length
  h.emit('SIGNED_IN', user('b'))
  h.initial.resolve({ data: { session: session(user()) } })
  await tick()
  await h.runTimers()
  assert.equal(h.requests.length, 0)
  assert.equal(h.updates.length, count)
  assert.equal(h.unsubscribed, 1)
})

test('StrictMode effect restart ignores requests belonging to the disposed effect', async () => {
  const h = harness()
  h.emit('SIGNED_IN', user())
  await h.runTimers()
  const stale = h.requests[0]
  h.restartEffect()
  await h.login(user('b'), 'viewer')
  stale.resolve({ data: 'admin', error: null })
  await tick()
  assert.deepEqual(h.state, { user: user('b'), role: 'viewer', loading: false })
  h.cleanup()
})

for (const mode of ['recovery', 'invite', 'initial-link']) {
  test(`password setup redirect survives a subsequent refresh: ${mode}`, async () => {
    const h = harness(mode === 'initial-link' ? 'https://example.test/people#type=recovery' : undefined)
    const account = mode === 'invite' ? { ...user(), invited_at: '2026-01-01' } : user()
    h.emit(mode === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', account)
    h.emit('TOKEN_REFRESHED', account)
    await h.runTimers()
    assert.equal(h.requests.length, 1)
    h.requests[0].resolve({ data: 'viewer', error: null })
    await tick()
    assert.equal(h.location.href, '/set-password')
    h.cleanup()
  })
}

test('a different account does not inherit a pending recovery redirect', async () => {
  const h = harness()
  h.emit('PASSWORD_RECOVERY', user())
  await h.login(user('b'))
  assert.equal(h.location.href, 'https://example.test/people')
  h.cleanup()
})
