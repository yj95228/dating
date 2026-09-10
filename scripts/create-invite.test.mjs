import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

const source = ts.transpileModule(readFileSync(new URL('../supabase/functions/create-invite/handler.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const context = { exports: {}, URL, Headers, Response }
vm.runInNewContext(source, context)
const { createInviteHandler } = context.exports
const appUrl = 'https://app.example.test'
const supabaseUrl = 'https://auth.example.test'
const inviteUrl = `${supabaseUrl}/auth/v1/verify?token=test-only&type=invite`

// Exercise the real SDK adapter and handler against mocked Auth/PostgREST HTTP.
// No real accounts, tokens, emails or database writes are used.
function harness({ role = 'admin', authStatus = 200, roleStatus = 200, generateStatus = 200,
  generateCode = '', throwRole = false, configuredAppUrl = appUrl, missingLink = false } = {}) {
  const calls = [], clients = []
  const fetch = async (input, init) => {
    const url = new URL(input)
    calls.push({ pathname: url.pathname, redirectTo: url.searchParams.get('redirect_to'), body: init.body ? JSON.parse(init.body) : null, headers: new Headers(init.headers) })
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } })
    if (url.pathname === '/auth/v1/user') {
      return json(authStatus === 200 ? { id: 'caller', email: 'admin@example.test', user_metadata: { role: 'admin' } }
        : { message: 'bad token', code: 'bad_jwt' }, authStatus)
    }
    if (url.pathname === '/rest/v1/rpc/current_user_role') {
      if (throwRole) throw new Error('network unavailable')
      return json(roleStatus === 200 ? role : { message: 'private upstream details' }, roleStatus)
    }
    assert.equal(url.pathname, '/auth/v1/admin/generate_link')
    return json(generateStatus === 200
      ? { action_link: missingLink ? undefined : inviteUrl, email_otp: 'never-return-this', hashed_token: 'never-return-this', verification_type: 'invite', id: 'invitee' }
      : { code: generateCode, message: 'private upstream details' }, generateStatus)
  }
  const handler = createInviteHandler({ supabaseUrl, anonKey: 'test-anon', serviceRoleKey: 'test-service', appUrl: configuredAppUrl },
    (url, key, options) => {
      clients.push(key)
      return createClient(url, key, { ...options, global: { ...options.global, fetch } })
    })
  const request = ({ method = 'POST', token = 'test-user-token', origin = appUrl, body = { email: ' Guest@Example.Test ' }, raw } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (origin) headers.Origin = origin
    return handler(new Request(`${supabaseUrl}/functions/v1/create-invite`, {
      method, headers, ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
    }))
  }
  return { request, calls, clients }
}

test('admin creates an invite with a fixed redirect and returns only the link', async () => {
  const h = harness()
  const result = await h.request({ body: { email: ' Guest@Example.Test ', role: 'admin', redirectTo: 'https://untrusted.example.test' } })
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), { inviteUrl })
  assert.equal(result.headers.get('cache-control'), 'no-store')
  assert.deepEqual(h.calls.map((call) => call.pathname), ['/auth/v1/user', '/rest/v1/rpc/current_user_role', '/auth/v1/admin/generate_link'])
  assert.equal(h.calls[1].headers.get('authorization'), 'Bearer test-user-token')
  assert.deepEqual(h.calls[2].body, { type: 'invite', email: 'guest@example.test', redirectTo: `${appUrl}/auth/callback?next=/set-password` })
  assert.equal(h.calls[2].redirectTo, `${appUrl}/auth/callback?next=/set-password`)
  assert.equal(h.calls[2].headers.get('authorization'), 'Bearer test-service')
})

test('pending invitation retries keep the invite type and never request login or recovery', async () => {
  const h = harness()
  assert.equal((await h.request()).status, 200)
  assert.equal((await h.request()).status, 200)
  const requests = h.calls.filter((call) => call.pathname.endsWith('generate_link'))
  assert.equal(requests.length, 2)
  assert.ok(requests.every((call) => call.body.type === 'invite'))
})

for (const [label, settings, request, status] of [
  ['missing login', {}, { token: '' }, 401],
  ['expired/forged token', { authStatus: 401 }, {}, 401],
  ['viewer with forged admin metadata', { role: 'viewer' }, {}, 403],
  ['missing profile', { role: null }, {}, 403],
  ['DB role lookup error', { roleStatus: 500 }, {}, 503],
  ['DB role network failure', { throwRole: true }, {}, 503],
  ['untrusted origin', {}, { origin: 'https://untrusted.example.test' }, 403],
]) {
  test(`${label} cannot construct a privileged client or issue an invitation`, async () => {
    const h = harness(settings)
    const response = await h.request(request)
    assert.equal(response.status, status)
    assert.ok(!h.clients.includes('test-service'))
    assert.ok(!JSON.stringify(await response.json()).includes('private upstream details'))
  })
}

for (const body of [{}, null, [], { email: 123 }, { email: '' }, { email: 'bad@address' }, { email: 'a'.repeat(255) + '@example.test' }]) {
  test(`invalid email rejected: ${JSON.stringify(body).slice(0, 45)}`, async () => {
    const h = harness()
    assert.equal((await h.request({ body })).status, 400)
    assert.ok(!h.clients.includes('test-service'))
  })
}

test('malformed JSON and unsupported methods are rejected; CORS preflight does not authenticate', async () => {
  const h = harness()
  assert.equal((await h.request({ raw: '{' })).status, 400)
  assert.equal((await h.request({ method: 'GET' })).status, 405)
  const before = h.calls.length
  const preflight = await h.request({ method: 'OPTIONS', token: '' })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), appUrl)
  assert.equal(h.calls.length, before)
})

for (const [generateCode, generateStatus, status, code] of [
  ['email_exists', 422, 409, 'already_registered'],
  ['user_already_exists', 422, 409, 'already_registered'],
  ['email_address_invalid', 422, 400, 'invalid_email'],
  ['over_request_rate_limit', 429, 429, 'rate_limited'],
  ['unexpected_failure', 500, 502, 'invite_failed'],
]) {
  test(`Supabase ${generateCode} is mapped without exposing upstream details or retrying another link type`, async () => {
    const h = harness({ generateCode, generateStatus })
    const response = await h.request()
    assert.equal(response.status, status)
    const body = await response.json()
    assert.equal(body.code, code)
    assert.ok(!JSON.stringify(body).includes('private upstream details'))
    assert.equal(h.calls.filter((call) => call.pathname.endsWith('generate_link')).length, 1)
  })
}

test('missing link or invalid server configuration fails closed', async () => {
  assert.equal((await harness({ missingLink: true }).request()).status, 500)
  for (const configuredAppUrl of ['', 'javascript:alert(1)', 'https://user:pass@app.example.test', `${appUrl}/wrong-path`]) {
    const h = harness({ configuredAppUrl })
    assert.equal((await h.request()).status, 500)
    assert.equal(h.calls.length, 0)
  }
})
