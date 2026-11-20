import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.98.0/cors'

const baseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? 'https://dating-note.vercel.app'
const configuredOrigin = (() => { try { return new URL(appUrl).origin } catch { return '' } })()
const ownedPreviewHost = /^dating(?:-[a-z0-9]+)*-yj95228s-projects[.]vercel[.]app$/
const allowedOrigin = (req: Request) => {
  const origin = req.headers.get('origin') ?? ''
  if (!origin) return ''
  if (origin === 'https://dating-note.vercel.app' || origin === configuredOrigin
      || origin === 'http://localhost:5173') return origin
  try {
    const url = new URL(origin)
    if (url.protocol === 'https:' && url.origin === origin && !url.port
        && url.hostname.split('.')[0].length <= 63
        && ownedPreviewHost.test(url.hostname)) return origin
  } catch { /* ignored */ }
  return ''
}
const cors = (req: Request) => {
  const h = new Headers(sdkCorsHeaders)
  h.delete('Access-Control-Allow-Origin')
  h.set('Content-Type', 'application/json')
  h.set('Cache-Control', 'no-store')
  h.set('Vary', 'Origin')
  const origin = allowedOrigin(req)
  if (origin) h.set('Access-Control-Allow-Origin', origin)
  return h
}
const output = (h: Headers, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: h })
const fail = (h: Headers, status: number, error: string) => output(h, status, { error })
const adminClient = () => createClient(baseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const verifiedAdmin = async (req: Request) => {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!bearer) return null
  const client = createClient(baseUrl, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + bearer } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: user, error } = await client.auth.getUser(bearer)
  if (error || !user.user) return null
  const { data: role, error: roleError } = await client.rpc('current_user_role')
  return !roleError && role === 'admin' ? user.user.id : null
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('')
const sha = async (raw: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
const secret = async (label: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey), 
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(label)))
}
const visitorSecret = (id: string, nonce: string) => secret('guest-visitor-v1:' + id + ':' + nonce)
const inviteSecret = (id: string) => secret('guest-referrer-v1:' + id)
const originUrl = (req: Request) => allowedOrigin(req) || configuredOrigin || 'https://dating-note.vercel.app'
const guestUrl = (req: Request, key: string, type: 'key' | 'invite' = 'key') =>
  originUrl(req) + '/i-need-money#' + type + '=' + encodeURIComponent(key)
const validToken = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const validName = (v: unknown, max = 40) => typeof v === 'string' && v.trim().length > 0
  && v.trim().length <= max && !/[\x00-\x1f]/.test(v)
const rateFingerprint = async (req: Request) => 
  await sha('guest-request-ip-v1:' + (req.headers.get('cf-connecting-ip') 
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'))

Deno.serve(async req => {
  const h = cors(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'POST') return fail(h, 405, '지원하지 않는 요청이에요.')
  if (req.headers.get('origin') && !allowedOrigin(req)) return fail(h, 403, '허용되지 않은 사이트예요.')
  if (!baseUrl || !anonKey || !serviceKey) return fail(h, 503, '서버 설정을 확인해 주세요.')
  let body: Record<string, unknown>
  try {
    const raw = await req.text()
    if (raw.length > 8000) return fail(h, 413, '요청이 너무 커요.')
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid')
    body = value as Record<string, unknown>
  } catch { return fail(h, 400, '요청 형식을 확인해 주세요.') }

  const db = adminClient()
  try {
    if (body.action === 'request') {
      if (!validName(body.name) || !['candidate','introducer'].includes(String(body.kind))) {
        return fail(h, 400, '이름과 이용 목적을 확인해 주세요.')
      }
      const invite = body.inviteToken
      let referrerId: string | null = null
      if (invite) {
        if (!validToken(invite)) return fail(h, 400, '소개 링크를 확인해 주세요.')
        const { data, error } = await db.from('guest_referrers')
          .select('id').eq('invite_token_hash', await sha(invite as string)).is('revoked_at', null)
          .maybeSingle()
        if (error || !data) return fail(h, 404, '사용할 수 없는 소개 링크예요.')
        referrerId = data.id
      }
      const note = typeof body.referrerName === 'string' ? body.referrerName.trim() : ''
      if (!referrerId && (!validName(note, 100))) {
        return fail(h, 400, '소개해 준 사람을 입력해 주세요.')
      }
      const ip = await rateFingerprint(req)
      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count, error: countError } = await db.from('guest_access_requests')
        .select('id', { count: 'exact', head: true }).eq('ip_fingerprint', ip).gte('created_at', from)
      if (countError) return fail(h, 503, '신청을 확인하지 못했어요.')
      if ((count ?? 0) >= 6) return fail(h, 429, '신청이 많아요. 잠시 후 다시 시도해 주세요.')
      const id = crypto.randomUUID()
      const nonce = crypto.randomUUID()
      const key = await visitorSecret(id, nonce)
      const { error } = await db.from('guest_access_requests').insert({
        id, token_nonce: nonce, access_token_hash: await sha(key),
        visitor_name: (body.name as string).trim(), applicant_kind: body.kind,
        referrer_id: referrerId, referrer_note: referrerId ? null : note,
        ip_fingerprint: ip,
      })
      if (error) return fail(h, 503, '신청을 저장하지 못했어요.')
      return output(h, 200, { status: 'pending', accessToken: key, url: guestUrl(req, key) })
    }

    if (body.action === 'status') {
      if (!validToken(body.accessToken)) return fail(h, 401, '개인 링크를 확인해 주세요.')
      const tokenHash = await sha(body.accessToken as string)
      const { data: request, error: requestError } = await db.from('guest_access_requests')
        .select('id,status,visitor_name').eq('access_token_hash', tokenHash).maybeSingle()
      if (requestError) return fail(h, 503, '접속 상태를 확인하지 못했어요.')
      if (request) {
        if (request.status !== 'approved') return output(h, 200, { status: request.status })
        const { data: pass } = await db.from('guest_access_passes')
          .select('id,revoked_at').eq('request_id', request.id).eq('access_token_hash', tokenHash).maybeSingle()
        return output(h, 200, { status: pass && !pass.revoked_at ? 'approved' : 'rejected' })
      }
      const { data: pass } = await db.from('guest_access_passes')
        .select('person_id,consent_nonce,revoked_at').eq('access_token_hash', tokenHash).maybeSingle()
      if (!pass || pass.revoked_at || !pass.person_id) return fail(h, 401, '개인 링크를 확인해 주세요.')
      const { data: consent } = await db.from('guest_profile_consents')
        .select('secret_nonce,management_agreed,management_consent_version,deletion_requested_at')
        .eq('person_id', pass.person_id).maybeSingle()
      const valid = consent && consent.secret_nonce === pass.consent_nonce
        && consent.management_agreed && consent.management_consent_version === 'guest-management-v1'
        && !consent.deletion_requested_at
      return output(h, 200, { status: valid ? 'approved' : 'rejected' })
    }

    const actor = await verifiedAdmin(req)
    if (!actor) return fail(h, 403, '관리자 권한이 필요해요.')

    if (body.action === 'admin-list') {
      const [requests, referrers] = await Promise.all([
        db.from('guest_access_requests').select(
          'id,visitor_name,applicant_kind,referrer_id,referrer_note,status,created_at,reviewed_at')
          .order('created_at', { ascending: false }).limit(200),
        db.from('guest_referrers').select('id,name,created_at,revoked_at')
          .order('created_at', { ascending: false }).limit(200),
      ])
      if (requests.error || referrers.error) return fail(h, 503, '접속 신청을 불러오지 못했어요.')
      return output(h, 200, {
        requests: (requests.data ?? []).map(r => ({
          ...r, personalUrl: r.status === 'approved' ? null : null,
        })),
        referrers: await Promise.all((referrers.data ?? []).map(async r => ({
          ...r, url: guestUrl(req, await inviteSecret(r.id), 'invite'),
        }))),
      })
    }
    if (body.action === 'admin-add-referrer') {
      if (!validName(body.name, 60)) return fail(h, 400, '소개자 이름을 확인해 주세요.')
      const id = crypto.randomUUID()
      const invite = await inviteSecret(id)
      const { error } = await db.from('guest_referrers').insert({
        id, name: (body.name as string).trim(), invite_token_hash: await sha(invite),
      })
      if (error) return fail(h, 503, '소개자를 추가하지 못했어요.')
      return output(h, 200, { id, url: guestUrl(req, invite, 'invite') })
    }
    if (body.action === 'admin-revoke-referrer') {
      if (typeof body.id !== 'string') return fail(h, 400, '소개자를 확인해 주세요.')
      const { error } = await db.from('guest_referrers')
        .update({ revoked_at: new Date().toISOString() }).eq('id', body.id)
      if (error) return fail(h, 503, '소개 링크를 중지하지 못했어요.')
      return output(h, 200, { done: true })
    }
    if (body.action === 'admin-review') {
      if (typeof body.id !== 'string' || !['approved','rejected'].includes(String(body.status)))
        return fail(h, 400, '승인 대상을 확인해 주세요.')
      const { data: item, error: lookupError } = await db.from('guest_access_requests')
        .select('id,token_nonce,status').eq('id', body.id).maybeSingle()
      if (lookupError || !item) return fail(h, 404, '승인 요청을 찾지 못했어요.')
      if (item.status !== 'pending') return fail(h, 409, '이미 처리된 신청이에요.')
      const status = body.status as 'approved' | 'rejected'
      const token = await visitorSecret(item.id, item.token_nonce)
      if (status === 'approved') {
        const { error: passError } = await db.from('guest_access_passes').insert({
          request_id: item.id, access_token_hash: await sha(token),
        })
        if (passError) return fail(h, 503, '접근 권한을 발급하지 못했어요.')
      }
      const { data: updated, error } = await db.from('guest_access_requests')
        .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: actor })
        .eq('id', item.id).eq('status', 'pending').select('id').maybeSingle()
      if (error || !updated) {
        if (status === 'approved') await db.from('guest_access_passes').delete().eq('request_id', item.id)
        return fail(h, 409, '요청 상태가 변경됐어요. 새로고침해 주세요.')
      }
      return output(h, 200, { done: true, url: status === 'approved' ? guestUrl(req, token) : null })
    }
    if (body.action === 'admin-revoke') {
      if (typeof body.id !== 'string') return fail(h, 400, '접속 요청을 확인해 주세요.')
      const { error } = await db.from('guest_access_passes')
        .update({ revoked_at: new Date().toISOString() }).eq('request_id', body.id)
      if (error) return fail(h, 503, '접근 권한을 중지하지 못했어요.')
      return output(h, 200, { done: true })
    }
    if (body.action === 'admin-personal-url') {
      if (typeof body.id !== 'string') return fail(h, 400, '방문자를 확인해 주세요.')
      const { data: r } = await db.from('guest_access_requests')
        .select('id,token_nonce,status').eq('id', body.id).maybeSingle()
      if (!r || r.status !== 'approved') return fail(h, 409, '승인된 방문자만 가능해요.')
      const token = await visitorSecret(r.id, r.token_nonce)
      const { data: pass } = await db.from('guest_access_passes').select('revoked_at')
        .eq('request_id', r.id).eq('access_token_hash', await sha(token)).maybeSingle()
      if (!pass || pass.revoked_at) return fail(h, 409, '사용 중지된 링크예요.')
      return output(h, 200, { url: guestUrl(req, token) })
    }
    return fail(h, 400, '알 수 없는 요청이에요.')
  } catch {
    return fail(h, 500, '요청을 처리하지 못했어요.')
  }
})
