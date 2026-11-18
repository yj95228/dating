import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? ''
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? ''

// Explicit, temporary preview allowlist for PR #4 functional testing.
// Remove this origin before merging if APP_PREVIEW_URL is configured in Supabase.
// Never accept arbitrary *.vercel.app origins.
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
const allowedOrigins = new Set([productionOrigin, previewOrigin, configuredPreviewOrigin].filter(Boolean))
const requestOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  return origin && allowedOrigins.has(origin) ? origin : ''
}
const cors = (request: Request): Headers => {
  const origin = request.headers.get('origin')
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  })
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin)
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
const commonUrl = async (id: string, origin: string) =>
  new URL('/share/' + await commonToken(id), origin).href

const validToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)

const activeLink = async (admin: ReturnType<typeof adminClient>, token: unknown) => {
  if (!validToken(token)) return null
  const { data } = await admin.from('guest_share_links').select('id,recipient_label,expires_at,revoked_at')
    .eq('token_hash', await digest(token)).maybeSingle()
  if (!data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null
  return data
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
    if (payload.action === 'browse') {
      const link = await activeLink(admin, payload.token)
      if (!link) return failure(headers, 404, '공유 링크가 만료되었거나 중지되었어요.')
      // The share-token controls access. Every active person is available without
      // a manual approval checkbox; no name, photos, match history or contact data.
      const { data: people, error } = await admin.from('people')
        .select('id,gender,year,height,location,job,is_direct,ideal_type,note,sort_order')
        .eq('status', '활성')
        .order('is_direct', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (error) return failure(headers, 503, '목록을 불러오지 못했어요.')
      return response(headers, 200, { people: (people ?? []).map(
        ({ id, gender, year, height, location, job, is_direct, ideal_type, note, sort_order }) => ({
          id, gender, year, height, location, job, is_direct, sort_order,
          public_ideal_type: ideal_type ?? '',
          public_traits: note ?? '',
        })
      ) })
    }

    if (payload.action === 'submit') {
      const link = await activeLink(admin, payload.token)
      if (!link) return failure(headers, 404, '공유 링크가 만료되었거나 중지되었어요.')
      const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : ''
      const kind = payload.applicantKind
      const personIds = payload.personIds
      if (nickname.length < 1 || nickname.length > 30 ||
          (kind !== 'candidate' && kind !== 'introducer') ||
          !Array.isArray(personIds) || !personIds.length || personIds.length > 500 ||
          !personIds.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0) ||
          new Set(personIds).size !== personIds.length) {
        return failure(headers, 400, '닉네임과 관심 후보를 확인해 주세요.')
      }
      // No shared, per-link daily quota: each visitor can submit independently.
      const { data: available } = await admin.from('people').select('id')
        .in('id', personIds).eq('status', '활성')
      if ((available ?? []).length !== personIds.length) {
        return failure(headers, 400, '현재 신청할 수 없는 후보가 있어요.')
      }
      const { data: created, error: insertError } = await admin.from('guest_interest_requests')
        .insert({ link_id: link.id, nickname, applicant_kind: kind }).select('id').single()
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

    if (payload.action === 'get-common-link') {
      const { data: existing, error } = await admin.from('guest_share_links')
        .select('id,token_hash,revoked_at').eq('is_common', true).is('revoked_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) return failure(headers, 503, '공용 링크를 조회하지 못했어요.')
      if (!existing) return response(headers, 200, { url: null })
      const token = await commonToken(existing.id)
      if (await digest(token) !== existing.token_hash) {
        return failure(headers, 503, '공유 링크 검증에 실패했어요. 관리자가 링크를 재발급해야 해요.')
      }
      return response(headers, 200, {
        url: await commonUrl(existing.id, requestOrigin(request) || productionOrigin || previewOrigin),
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
          url: await commonUrl(existing.id, requestOrigin(request) || productionOrigin || previewOrigin),
        })
      }
      if (!existing && rotating) return failure(headers, 409, '기존 공용 링크가 없어요. 먼저 생성해 주세요.')
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
        id, token_hash: await digest(token), recipient_label: '공용 링크',
        created_by: actorId, is_common: true, expires_at: null,
      })
      if (insertError) {
        if (existing) await admin.from('guest_share_links').update({ revoked_at: null }).eq('id', existing.id)
        return failure(headers, 503, '공용 링크를 생성하지 못했어요.')
      }
      // Invalidate earlier per-recipient share links after the replacement exists.
      // Do not delete links: saved interest requests still reference them.
      await admin.from('guest_share_links').update({ revoked_at: new Date().toISOString() })
        .eq('is_common', false).is('revoked_at', null)
      return response(headers, 200, {
        url: await commonUrl(id, requestOrigin(request) || productionOrigin || previewOrigin),
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
