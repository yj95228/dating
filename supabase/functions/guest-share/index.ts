import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.98.0/cors'
import webpush from 'npm:web-push@3.6.7'
import { hideMatchedProfiles } from './match-visibility.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? ''
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? ''

// Accept the configured app, production alias, and Vercel deployments belonging
// to this project/team only. Vercel shortens branch aliases above DNS label limits.
const parseOrigin = (value: string) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && !(url.hostname === 'localhost' && url.protocol === 'http:')) return ''
    if (url.username || url.password || url.search || url.hash) return ''
    return url.origin
  } catch { return '' }
}
const productionOrigin = parseOrigin(appUrl)
const previewOrigin = 'https://dating-git-feat-guest-interest-push-yj95228s-projects.vercel.app'
const configuredPreviewOrigin = parseOrigin(Deno.env.get('APP_PREVIEW_URL') ?? '')
const allowedOrigins = new Set([
  productionOrigin, 'https://dating-note.vercel.app', previewOrigin, configuredPreviewOrigin,
].filter(Boolean))
const ownedPreviewHost = /^dating(?:-[a-z0-9]+)*-yj95228s-projects[.]vercel[.]app$/
const isOwnedPreviewOrigin = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value && !url.port
      && url.hostname.split('.')[0].length <= 63
      && ownedPreviewHost.test(url.hostname)
  } catch { return false }
}
const requestOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  return origin && (allowedOrigins.has(origin) || isOwnedPreviewOrigin(origin)) ? origin : ''
}
const cors = (request: Request): Headers => {
  // Use SDK-managed headers to support additional client preflight headers.
  const headers = new Headers(sdkCorsHeaders)
  headers.delete('Access-Control-Allow-Origin')
  headers.set('Content-Type', 'application/json')
  headers.set('Cache-Control', 'no-store')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Vary', 'Origin')
  const origin = requestOrigin(request)
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}
const response = (headers: Headers, code: number, value: unknown) =>
  new Response(JSON.stringify(value), { status: code, headers })
const failure = (headers: Headers, code: number, message: string) =>
  response(headers, code, { error: message })

const digest = async (token: string) => {
  const bytes = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('')
}

const adminClient = () => createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const verifiedAdmin = async (request: Request) => {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!bearer) return null
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: identity, error: userError } = await caller.auth.getUser(bearer)
  if (userError || !identity.user) return null
  const { data: role, error: roleError } = await caller.rpc('current_user_role')
  if (roleError || role !== 'admin') return null
  return identity.user.id
}
// The common link token can be reconstructed only on the trusted server.
// A random UUID is the public link identifier; HMAC uses the server secret and
// prevents deriving a share token from an exposed database row id.
const commonToken = async (id: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('guest-common-v1:' + id))
  return [...new Uint8Array(signed)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
// New 16-character links use the first 96 bits of the HMAC. Previously sent
// 22-character (128-bit) aliases and 64-character legacy URLs remain valid.
const shortCommonToken = async (id: string, bits: 96 | 128 = 96): Promise<string> => {
  const fullHex = await commonToken(id)
  const bytes = fullHex.slice(0, bits / 4).match(/.{2}/g) ?? []
  const binary = bytes.map(hex => String.fromCharCode(Number.parseInt(hex, 16))).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
// Older frontends still request the old format; preserve them until their update.
const commonUrl = async (id: string, origin: string, format: unknown) =>
  new URL(format === 'public' ? '/i-need-money' :
    format === 'short' ? '/s/' + await shortCommonToken(id) :
      '/share/' + await commonToken(id), origin).href

const isLegacyToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)
const isShortToken = (token: unknown): token is string =>
  typeof token === 'string' && /^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.test(token)

const activeLink = async (admin: ReturnType<typeof adminClient>, token: unknown) => {
  // /share is intentionally public: the current active share record still
  // controls availability, but no secret is required to browse or apply.
  if (token === 'public') {
    const { data, error } = await admin.from('guest_share_links')
      .select('id,recipient_label,expires_at,revoked_at,token_hash')
      .eq('is_common', true).is('revoked_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null
    if (await digest(await commonToken(data.id)) !== data.token_hash) return null
    return data
  }
  if (isShortToken(token)) {
    const { data, error } = await admin.from('guest_share_links')
      .select('id,recipient_label,expires_at,revoked_at')
      .eq('is_common', true).is('revoked_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const bits = token.length === 22 ? 128 : 96
    if (error || !data || await shortCommonToken(data.id, bits) !== token ||
        (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null
    return data
  }
  if (!isLegacyToken(token)) return null
  const { data } = await admin.from('guest_share_links')
    .select('id,recipient_label,expires_at,revoked_at')
    .eq('token_hash', await digest(token)).maybeSingle()
  if (!data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null
  return data
}
// Public guest access uses a shared passcode; the joke URL is never the secret.
// PBKDF2 limits offline guessing if the settings table is exposed. Sessions are
// HMAC-signed, expire in thirty days, and are invalidated by any code change.
type GuestSettings = { code_hash: string; code_salt: string; version: number }
const ACCESS_EXPIRY_SECONDS = 30 * 24 * 60 * 60
const bytesHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
const hexBytes = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], x => Number.parseInt(x, 16))
const safeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
const passwordHash = async (code: string, salt: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits'])
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexBytes(salt), iterations: 180000, hash: 'SHA-256' }, key, 256)
  return bytesHex(new Uint8Array(result))
}
const accessSignature = async (message: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('guest-access-v1:' + message))
  return bytesHex(new Uint8Array(signed))
}
const makeAccessSession = async (version: number) => {
  const message = `1.${version}.${Math.floor(Date.now() / 1000) + ACCESS_EXPIRY_SECONDS}.${bytesHex(crypto.getRandomValues(new Uint8Array(16)))}`
  return message + '.' + await accessSignature(message)
}
const validAccessSession = async (token: unknown, settings: GuestSettings): Promise<boolean> => {
  if (typeof token !== 'string' || token.length > 250) return false
  const match = /^(1\.[0-9]{1,12}\.[0-9]{10,12}\.[0-9a-f]{32})\.([0-9a-f]{64})$/.exec(token)
  if (!match) return false
  const parts = match[1].split('.')
  const expiry = Number(parts[2])
  return Number(parts[1]) === settings.version && Number.isSafeInteger(expiry)
    && expiry > Math.floor(Date.now() / 1000)
    && expiry <= Math.floor(Date.now() / 1000) + ACCESS_EXPIRY_SECONDS
    && safeCompare(await accessSignature(match[1]), match[2])
}
const guestSettings = async (admin: ReturnType<typeof adminClient>) => {
  const { data, error } = await admin.from('guest_access_settings')
    .select('code_hash,code_salt,version').eq('id', true).maybeSingle()
  if (error) throw error
  return data as GuestSettings | null
}
const ipFingerprint = async (request: Request) => {
  // Cloudflare proxy sets the connecting IP; never trust client-supplied XFF.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unidentified'
  return await digest('guest-login-ip:' + ip + ':' + serviceKey)
}
const unlockGuest = async (admin: ReturnType<typeof adminClient>, request: Request,
  headers: Headers, payload: Record<string, unknown>) => {
  const settings = await guestSettings(admin)
  if (!settings) return failure(headers, 503, '관리자가 아직 접속 코드를 설정하지 않았어요.')
  const code = typeof payload.code === 'string' ? payload.code : ''
  if (code.length < 1 || code.length > 64) return failure(headers, 400, '접속 코드를 확인해 주세요.')
  const fingerprint = await ipFingerprint(request)
  const { data: attempts, error: lookupError } = await admin.from('guest_access_attempts')
    .select('failures,locked_until').eq('fingerprint', fingerprint).maybeSingle()
  if (lookupError) return failure(headers, 503, '인증을 처리하지 못했어요.')
  const now = Date.now()
  if (attempts?.locked_until && Date.parse(attempts.locked_until) > now) {
    return failure(headers, 429, '입력 횟수가 많아요. 15분 뒤 다시 시도해 주세요.')
  }
  const candidate = await passwordHash(code, settings.code_salt)
  if (!safeCompare(candidate, settings.code_hash)) {
    const failures = (attempts?.locked_until && Date.parse(attempts.locked_until) <= now)
      ? 1 : (attempts?.failures ?? 0) + 1
    const locked_until = failures >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null
    await admin.from('guest_access_attempts').upsert({
      fingerprint, failures, locked_until, updated_at: new Date(now).toISOString(),
    })
    return failure(headers, failures >= 5 ? 429 : 401,
      failures >= 5 ? '입력 횟수가 많아요. 15분 뒤 다시 시도해 주세요.' : '접속 코드가 맞지 않아요.')
  }
  await admin.from('guest_access_attempts').delete().eq('fingerprint', fingerprint)
  return response(headers, 200, { accessToken: await makeAccessSession(settings.version) })
}

// Only active candidates who explicitly approved the exact current public profile
// can be sent through the anonymous guest API. This check runs on every browse
// and on every interest submission (including old secret-link routes).
const CONSENT_VERSION = 'guest-profile-v4'
const MANAGEMENT_VERSION = 'guest-management-v1'
type PublicPerson = {
  id: number; gender: string; year: string | null; height: number | null;
  location: string | null; job: string | null; is_direct: boolean;
  ideal_type: string | null; note: string | null; sort_order: number | null
}
const publicProfile = (p: PublicPerson) => ({
  gender: p.gender, year: p.year, height: p.height,
  location: p.location, job: p.job, is_direct: Boolean(p.is_direct),
  public_ideal_type: p.ideal_type ?? '', public_traits: p.note ?? '',
})
const profileSignature = async (p: PublicPerson) =>
  await digest(CONSENT_VERSION + ':' + JSON.stringify(publicProfile(p)))
const approvedPeople = async (admin: ReturnType<typeof adminClient>): Promise<PublicPerson[]> => {
  const { data, error } = await admin.from('people')
    .select('id,gender,year,height,location,job,is_direct,ideal_type,note,sort_order')
    .eq('status', '활성')
    .order('is_direct', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  const people = (data ?? []) as PublicPerson[]
  if (!people.length) return []
  const { data: consents, error: consentError } = await admin.from('guest_profile_consents')
    .select('person_id,decision,profile_signature,consented_at,management_agreed,management_consented_at,management_consent_version,deletion_requested_at')
    .in('person_id', people.map(p => p.id))
  if (consentError) throw consentError
  const byPerson = new Map((consents ?? []).map(row => [Number(row.person_id), row]))
  const checked = await Promise.all(people.map(async p => {
    const consent = byPerson.get(p.id)
    return consent?.decision === 'approved'
      && consent.management_agreed === true
      && consent.management_consent_version === MANAGEMENT_VERSION
      && typeof consent.management_consented_at === 'string'
      && Number.isFinite(Date.parse(consent.management_consented_at))
      && consent.deletion_requested_at == null
      && typeof consent.consented_at === 'string'
      && Number.isFinite(Date.parse(consent.consented_at))
      && consent.profile_signature === await profileSignature(p) ? p : null
  }))
  return checked.filter((p): p is PublicPerson => p !== null)
}

// A candidate sees neither their own profile nor profiles of people they have
// ever matched with. Only a verified candidate link has a trusted person ID;
// anonymous/referrer visitor passes cannot be mapped to an existing candidate.
const visiblePeopleForVisitor = async (
  admin: ReturnType<typeof adminClient>, personId: number | null,
): Promise<PublicPerson[]> => {
  const people = await approvedPeople(admin)
  if (personId === null) return people
  const { data: matches, error } = await admin.from('matches')
    .select('male_id,female_id')
    .or(`male_id.eq.${personId},female_id.eq.${personId}`)
  // Fail closed: a database error must never expose an unfiltered list.
  if (error) throw error
  return hideMatchedProfiles(people, personId, matches ?? [])
}

// Only a server-verified personal bearer link can authorize reading profiles.
const personalPass = async (admin: ReturnType<typeof adminClient>, token: unknown) => {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null
  const { data: pass, error } = await admin.from('guest_access_passes')
    .select('id,person_id,request_id,consent_nonce,revoked_at')
    .eq('access_token_hash', await digest(token)).maybeSingle()
  if (error || !pass || pass.revoked_at) return null
  if (pass.person_id) {
    const { data: consent } = await admin.from('guest_profile_consents')
      .select('secret_nonce,management_agreed,management_consent_version,deletion_requested_at')
      .eq('person_id', pass.person_id).maybeSingle()
    if (!consent || consent.secret_nonce !== pass.consent_nonce
        || !consent.management_agreed || consent.management_consent_version !== MANAGEMENT_VERSION
        || consent.deletion_requested_at) return null
    const { data: person } = await admin.from('people').select('name')
      .eq('id', pass.person_id).maybeSingle()
    if (!person) return null
    return { personId: Number(pass.person_id), name: person.name || '기존 등록 후보', kind: 'candidate' }
  }
  const { data: request } = await admin.from('guest_access_requests')
    .select('status,visitor_name,applicant_kind').eq('id', pass.request_id)
    .eq('access_token_hash', await digest(token)).maybeSingle()
  return request?.status === 'approved'
    ? { personId: null, name: request.visitor_name, kind: request.applicant_kind } : null
}

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } }
const validSubscription = (input: unknown): input is Subscription => {
  if (!input || typeof input !== 'object') return false
  const sub = input as Partial<Subscription>
  return typeof sub.endpoint === 'string'
    && sub.endpoint.length <= 2048
    && /^https:\/\//.test(sub.endpoint)
    && typeof sub.keys?.p256dh === 'string' && sub.keys.p256dh.length <= 300
    && typeof sub.keys?.auth === 'string' && sub.keys.auth.length <= 100
}
const sendPush = async (admin: ReturnType<typeof adminClient>) => {
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return
  const { data: subscriptions, error } = await admin.from('guest_push_subscriptions')
    .select('endpoint,subscription').limit(100)
  if (error || !subscriptions?.length) return
  try { webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate) } catch { return }
  await Promise.allSettled(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification(sub.subscription as Subscription,
        JSON.stringify({ title: '소개팅 주선 노트', body: '새 관심 신청이 도착했어요.', url: '/requests' }),
        { TTL: 60 * 60 })
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        await admin.from('guest_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }))
}

Deno.serve(async request => {
  const headers = cors(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return failure(headers, 405, '지원하지 않는 요청이에요.')
  const origin = request.headers.get('origin')
  // Require the configured application origin for browser requests, including guest requests.
  if (!allowedOrigins.size || (origin && !requestOrigin(request))) return failure(headers, 403, '이 사이트 주소는 서버에 허용되지 않았어요. Preview 주소 설정을 확인해 주세요.')
  if (!supabaseUrl || !anonKey || !serviceKey) return failure(headers, 503, '서버 설정이 필요해요.')
  let payload: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 12000) return failure(headers, 413, '요청이 너무 커요.')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('invalid')
    payload = parsed as Record<string, unknown>
  } catch { return failure(headers, 400, '잘못된 요청이에요.') }

  const admin = adminClient()
  try {
    if (payload.action === 'unlock') return failure(headers, 410, '이제 개인 링크로 접속해 주세요.')

    const visitor = payload.action === 'browse' || payload.action === 'submit'
      ? await personalPass(admin, payload.accessToken) : null
    if ((payload.action === 'browse' || payload.action === 'submit') && !visitor) {
      return failure(headers, 401, '개인 링크를 확인해 주세요.')
    }

    if (payload.action === 'browse') {
      // Candidate consent, not any access link, authorizes disclosure.
      const people = await visiblePeopleForVisitor(admin, visitor!.personId)
      return response(headers, 200, { people: people.map(p => ({
        id: p.id, sort_order: p.sort_order, ...publicProfile(p),
      })) })
    }

    if (payload.action === 'submit') {
      const link = await activeLink(admin, 'public')
      if (!link) return failure(headers, 503, '관리자가 소개팅 목록 링크를 준비해야 해요.')
      const nickname = visitor!.name.slice(0, 30)
      const kind = visitor!.kind
      const personIds = payload.personIds
      if (!Array.isArray(personIds) || !personIds.length || personIds.length > 500 ||
          !personIds.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0) ||
          new Set(personIds).size !== personIds.length) {
        return failure(headers, 400, '닉네임과 관심 후보를 확인해 주세요.')
      }
      // Deduplicate only identical submissions from the same browser; the
      // public URL remains shared and has no total submission quota.
      const visitorId = typeof payload.visitorId === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.visitorId)
        ? payload.visitorId.toLowerCase() : null
      const submissionFingerprint = visitorId
        ? await accessSignature('interest-dedupe-v1:' + JSON.stringify([
            link.id, visitorId, nickname.toLowerCase().replace(/\s+/g, ' ').trim(),
            kind, [...personIds].sort((a, b) => Number(a) - Number(b)),
          ]))
        : null
      // Old frontends without a visitor ID still work with null fingerprint.
      const approvedIds = new Set((await visiblePeopleForVisitor(admin, visitor!.personId)).map(p => p.id))
      if (!personIds.every((id: number) => approvedIds.has(id))) {
        return failure(headers, 400, '현재 선택할 수 없는 후보가 있어요. 목록을 새로고침해 주세요.')
      }
      const { data: created, error: insertError } = await admin.from('guest_interest_requests')
        .insert({ link_id: link.id, nickname, applicant_kind: kind,
          applicant_person_id: visitor!.personId,
          submission_fingerprint: submissionFingerprint }).select('id').single()
      if (insertError?.code === '23505' && submissionFingerprint) {
        return failure(headers, 409, '이미 같은 내용으로 신청했어요. 다른 후보를 선택해 주세요.')
      }
      if (insertError || !created) return failure(headers, 503, '신청을 저장하지 못했어요.')
      const { error: choicesError } = await admin.from('guest_interest_choices').insert(
        personIds.map(personId => ({ request_id: created.id, person_id: personId }))
      )
      if (choicesError) {
        await admin.from('guest_interest_requests').delete().eq('id', created.id)
        return failure(headers, 503, '신청을 저장하지 못했어요.')
      }
      // Push is best effort; successful submissions must not fail if push fails.
      try { await sendPush(admin) } catch { /* intentionally ignored */ }
      return response(headers, 200, { submitted: true })
    }

    const actorId = await verifiedAdmin(request)
    if (!actorId) return failure(headers, 403, '관리자 로그인 후 사용할 수 있어요.')

    // Administrator-only read-only snapshot of the same consent-checked public profiles.
    if (payload.action === 'admin-preview') {
      const people = await approvedPeople(admin)
      return response(headers, 200, { people: people.map(p => ({
        id: p.id, sort_order: p.sort_order, ...publicProfile(p),
      })) })
    }

    if (payload.action === 'get-access-status') {
      return response(headers, 200, { configured: Boolean(await guestSettings(admin)) })
    }
    if (payload.action === 'set-access-code') {
      const code = typeof payload.code === 'string' ? payload.code.trim() : ''
      if (code.length < 8 || code.length > 64) {
        return failure(headers, 400, '접속 코드는 8~64글자로 설정해 주세요.')
      }
      const before = await guestSettings(admin)
      const code_salt = bytesHex(crypto.getRandomValues(new Uint8Array(16)))
      const code_hash = await passwordHash(code, code_salt)
      const { error } = await admin.from('guest_access_settings')
        .upsert({ id: true, code_salt, code_hash,
          version: (before?.version ?? 0) + 1, updated_at: new Date().toISOString() })
      if (error) return failure(headers, 503, '접속 코드를 저장하지 못했어요.')
      return response(headers, 200, { configured: true })
    }

    if (payload.action === 'get-common-link') {
      const { data: existing, error } = await admin.from('guest_share_links')
        .select('id,token_hash,revoked_at').eq('is_common', true).is('revoked_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) return failure(headers, 503, '소개팅 링크를 조회하지 못했어요.')
      if (!existing) return response(headers, 200, { url: null })
      const token = await commonToken(existing.id)
      if (await digest(token) !== existing.token_hash) {
        return failure(headers, 503, '공유 링크 검증에 실패했어요. 관리자가 링크를 재발급해야 해요.')
      }
      return response(headers, 200, {
        url: await commonUrl(existing.id, requestOrigin(request) || productionOrigin || previewOrigin, payload.format),
      })
    }

    if (payload.action === 'create-common-link' || payload.action === 'rotate-common-link') {
      const rotating = payload.action === 'rotate-common-link'
      const { data: existing, error: readError } = await admin.from('guest_share_links')
        .select('id,token_hash').eq('is_common', true).is('revoked_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (readError) return failure(headers, 503, '공유 링크 상태를 조회하지 못했어요.')
      if (existing && !rotating) {
        return response(headers, 200, {
          url: await commonUrl(existing.id, requestOrigin(request) || productionOrigin || previewOrigin, payload.format),
        })
      }
      if (!existing && rotating) return failure(headers, 409, '기존 소개팅 링크가 없어요. 먼저 생성해 주세요.')
      const id = crypto.randomUUID()
      const token = await commonToken(id)
      // On rotation revoke first to satisfy the unique active-link constraint.
      // Revocation is reversible if insertion fails, while old interest history stays intact.
      if (existing) {
        const { error: revokeError } = await admin.from('guest_share_links')
          .update({ revoked_at: new Date().toISOString() }).eq('id', existing.id).is('revoked_at', null)
        if (revokeError) return failure(headers, 503, '이전 링크를 중지하지 못했어요.')
      }
      const { error: insertError } = await admin.from('guest_share_links').insert({
        id, token_hash: await digest(token), recipient_label: '소개팅 링크',
        created_by: actorId, is_common: true, expires_at: null,
      })
      if (insertError) {
        if (existing) await admin.from('guest_share_links').update({ revoked_at: null }).eq('id', existing.id)
        return failure(headers, 503, '소개팅 링크를 생성하지 못했어요.')
      }
      // Invalidate earlier per-recipient share links after the replacement exists.
      // Do not delete links: saved interest requests still reference them.
      await admin.from('guest_share_links').update({ revoked_at: new Date().toISOString() })
        .eq('is_common', false).is('revoked_at', null)
      return response(headers, 200, {
        url: await commonUrl(id, requestOrigin(request) || productionOrigin || previewOrigin, payload.format),
      })
    }

    if (payload.action === 'push-key') {
      if (!vapidPublic || !vapidPrivate || !vapidSubject) {
        return failure(headers, 503, '푸시 알림 서버 키가 아직 설정되지 않았어요.')
      }
      return response(headers, 200, { publicKey: vapidPublic })
    }

    if (payload.action === 'subscribe') {
      if (!validSubscription(payload.subscription)) return failure(headers, 400, '유효하지 않은 알림 구독이에요.')
      const sub = payload.subscription
      const { error } = await admin.from('guest_push_subscriptions')
        .upsert({ endpoint: sub.endpoint, owner_id: actorId, subscription: sub })
      if (error) return failure(headers, 503, '알림 구독을 저장하지 못했어요.')
      return response(headers, 200, { subscribed: true })
    }

    if (payload.action === 'unsubscribe') {
      const endpoint = payload.endpoint
      if (typeof endpoint !== 'string' || endpoint.length > 2048) return failure(headers, 400, '잘못된 구독이에요.')
      await admin.from('guest_push_subscriptions').delete().eq('owner_id', actorId).eq('endpoint', endpoint)
      return response(headers, 200, { unsubscribed: true })
    }
    return failure(headers, 400, '알 수 없는 요청이에요.')
  } catch {
    // Do not leak person data, tokens or server errors.
    return failure(headers, 500, '요청을 처리하지 못했어요. 다시 시도해 주세요.')
  }
})
