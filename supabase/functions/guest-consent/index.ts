import { createClient } from 'npm:@supabase/supabase-js@2.98.0'
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.98.0/cors'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? ''
const CONSENT_VERSION = 'guest-profile-v4'
const MANAGEMENT_VERSION = 'guest-management-v1'

const parseOrigin = (text: string) => {
  try {
    const u = new URL(text)
    return u.protocol === 'https:' && u.origin === text ? u.origin : ''
  } catch { return '' }
}
const allowedOrigins = new Set([
  parseOrigin(appUrl),
  'https://dating-note.vercel.app',
  parseOrigin(Deno.env.get('APP_PREVIEW_URL') ?? ''),
].filter(Boolean))
const ownedPreviewHost = /^dating(?:-[a-z0-9]+)*-yj95228s-projects[.]vercel[.]app$/
const trustedOrigin = (request: Request) => {
  const origin = request.headers.get('origin') ?? ''
  if (allowedOrigins.has(origin)) return origin
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.origin === origin && !url.port
      && url.hostname.split('.')[0].length <= 63 && ownedPreviewHost.test(url.hostname) ? origin : ''
  } catch { return '' }
}
const cors = (request: Request) => {
  const headers = new Headers(sdkCorsHeaders)
  headers.delete('Access-Control-Allow-Origin')
  const origin = trustedOrigin(request)
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  return headers
}
const output = (headers: Headers, status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers })
const failure = (headers: Headers, status: number, message: string) =>
  output(headers, status, { error: message })
const adminClient = () => createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const verifiedAdmin = async (request: Request) => {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!bearer) return false
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + bearer } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: identity, error } = await caller.auth.getUser(bearer)
  if (error || !identity.user) return false
  const { data: role, error: roleError } = await caller.rpc('current_user_role')
  return !roleError && role === 'admin'
}
type Person = {
  id: number; name: string | null; photos: string[] | null;
  gender: string; year: string | null; height: number | null;
  location: string | null; job: string | null; is_direct: boolean;
  ideal_type: string | null; note: string | null; status: string
}
type Consent = {
  person_id: number; secret_nonce: string;
  decision: 'pending' | 'approved' | 'declined' | 'withdrawn';
  profile_signature: string | null; consented_at: string | null;
  decided_at: string | null; management_agreed: boolean;
  management_consented_at: string | null;
  management_consent_version: string | null;
  deletion_requested_at: string | null;
  updated_at: string;
}
const profileOf = (p: Person) => ({
  gender: p.gender, year: p.year, height: p.height,
  location: p.location, job: p.job, is_direct: Boolean(p.is_direct),
  public_ideal_type: p.ideal_type ?? '', public_traits: p.note ?? '',
})
const bytesHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('')
const signatureOf = async (profile: ReturnType<typeof profileOf>) =>
  bytesHex(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(CONSENT_VERSION + ':' + JSON.stringify(profile))))
// Do not expose names, raw images, or photo URLs in the public consent page.
const managementSummary = (p: Person) => ({
  nameStored: Boolean(p.name?.trim()),
  photoCount: Array.isArray(p.photos) ? p.photos.length : 0,
  fields: ['이름', '사진', '성별', '출생연도', '키', '거주지', '직장/직업',
    '이상형', '특징', '후보 상태', '매칭 이력'],
})
// Bind the displayed management summary to current internal records without exposing them.
const managementIdentity = (p: Person) => ({
  name: p.name, photos: p.photos, ...profileOf(p), status: p.status,
})
const managementSignature = async (p: Person) =>
  bytesHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    MANAGEMENT_VERSION + ':' + JSON.stringify(managementIdentity(p))
  )))

// A link holder may correct only editable public description fields.
// Gender, relationship category, names, photos and match records stay admin-controlled.
const editableProfile = (value: unknown, current: ReturnType<typeof profileOf>) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const allowed = ['year', 'height', 'location', 'job', 'public_ideal_type', 'public_traits']
  if (Object.keys(input).length !== allowed.length
      || Object.keys(input).some(key => !allowed.includes(key))) return null
  const text = (key: string, max: number) => {
    const v = input[key]
    if (typeof v !== 'string' || v.length > max) return null
    return v.trim()
  }
  const year = text('year', 4)
  const location = text('location', 100)
  const job = text('job', 140)
  const ideal = text('public_ideal_type', 600)
  const traits = text('public_traits', 1600)
  if (year === null || location === null || job === null || ideal === null || traits === null) return null
  if (year && (!/^(19|20)\d{2}$/.test(year) || Number(year) > new Date().getFullYear())) return null
  const h = input.height
  if (h !== null && (typeof h !== 'number' || !Number.isFinite(h)
      || h < 80 || h > 250 || Math.round(h * 10) !== h * 10)) return null
  return { ...current, year: year || null, height: h as number | null,
    location: location || null, job: job || null,
    public_ideal_type: ideal, public_traits: traits }
}
const hmac = async (personId: number, nonce: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const result = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode('guest-consent-v1:' + personId + ':' + nonce))
  return bytesHex(result).slice(0, 32)
}
const sameString = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
const personIdFrom = (value: unknown): number | null => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return null
  return Number(value)
}
const readPerson = async (admin: ReturnType<typeof adminClient>, id: number) => {
  const { data, error } = await admin.from('people')
    .select('id,name,photos,gender,year,height,location,job,is_direct,ideal_type,note,status')
    .eq('id', id).maybeSingle()
  if (error) throw error
  return data as Person | null
}
const readConsent = async (admin: ReturnType<typeof adminClient>, id: number) => {
  const { data, error } = await admin.from('guest_profile_consents')
    .select('person_id,secret_nonce,decision,profile_signature,consented_at,decided_at,management_agreed,management_consented_at,management_consent_version,deletion_requested_at,updated_at')
    .eq('person_id', id).maybeSingle()
  if (error) throw error
  return data as Consent | null
}
const effective = async (p: Person, consent: Consent | null) =>
  p.status === '활성' && consent?.decision === 'approved'
  && consent.management_agreed === true
  && consent.management_consent_version === MANAGEMENT_VERSION
  && Boolean(consent.management_consented_at)
  && Boolean(consent.consented_at)
  && Number.isFinite(Date.parse(consent.consented_at!))
  && sameString(consent.profile_signature ?? '',
    await signatureOf(profileOf(p)))
const linkResponse = async (request: Request, personId: number, consent: Consent) => {
  const origin = trustedOrigin(request) || parseOrigin(appUrl) || 'https://dating-note.vercel.app'
  const token = personId + '-' + await hmac(personId, consent.secret_nonce)
  return new URL('/consent/' + token, origin).href
}
// A candidate's consent link is already tied to a specific DB person ID.
// Mint a separate, revocable browser-independent link only after management consent.
const digest = async (raw: string) => {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(data), b => b.toString(16).padStart(2, '0')).join('')
}
const personalKey = async (id: number, nonce: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode('guest-candidate-v1:' + id + ':' + nonce))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
const candidateAccessUrl = async (db: ReturnType<typeof adminClient>,
  req: Request, personId: number, consent: Consent) => {
  if (!consent.management_agreed || consent.management_consent_version !== MANAGEMENT_VERSION
      || !consent.management_consented_at || consent.deletion_requested_at) return null
  const key = await personalKey(personId, consent.secret_nonce)
  const hash = await digest(key)
  const { error } = await db.from('guest_access_passes').upsert({
    person_id: personId, consent_nonce: consent.secret_nonce, access_token_hash: hash,
  }, { onConflict: 'access_token_hash', ignoreDuplicates: true })
  if (error) throw error
  const { data: pass, error: readError } = await db.from('guest_access_passes')
    .select('id,revoked_at').eq('access_token_hash', hash).maybeSingle()
  if (readError || !pass || pass.revoked_at) return null
  const origin = trustedOrigin(req) || parseOrigin(appUrl) || 'https://dating-note.vercel.app'
  return origin + '/i-need-money#key=' + encodeURIComponent(key)
}
Deno.serve(async request => {
  const headers = cors(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return failure(headers, 405, '지원하지 않는 요청이에요.')
  const origin = request.headers.get('origin')
  if (origin && !trustedOrigin(request)) return failure(headers, 403, '허용되지 않는 사이트예요.')
  if (!supabaseUrl || !anonKey || !serviceKey) return failure(headers, 503, '서버 설정이 필요해요.')
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 8000) return failure(headers, 413, '요청이 너무 커요.')
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('invalid')
    body = data as Record<string, unknown>
  } catch { return failure(headers, 400, '잘못된 요청이에요.') }
  const admin = adminClient()
  try {
    if (body.action === 'view' || body.action === 'decide') {
      const token = typeof body.token === 'string' ? body.token : ''
      const match = /^([1-9][0-9]{0,14})-([0-9a-f]{32})$/.exec(token)
      if (!match) return failure(headers, 404, '유효하지 않은 동의 링크예요.')
      const id = personIdFrom(Number(match[1]))
      if (!id) return failure(headers, 404, '유효하지 않은 동의 링크예요.')
      const consent = await readConsent(admin, id)
      if (!consent || !sameString(await hmac(id, consent.secret_nonce), match[2]))
        return failure(headers, 404, '동의 링크가 만료되었거나 변경되었어요.')
      const person = await readPerson(admin, id)
      if (!person) return failure(headers, 404, '프로필을 찾을 수 없어요.')
      const preview = profileOf(person)
      if (body.action === 'view') {
        const isEffective = await effective(person, consent)
        return output(headers, 200, {
          profile: preview, active: person.status === '활성',
          decision: isEffective ? 'approved' :
            consent.decision === 'approved' ? 'needs-review' : consent.decision,
          policyVersion: CONSENT_VERSION,
          previewSignature: await signatureOf(preview),
          managementSignature: await managementSignature(person),
          managementSummary: managementSummary(person),
          managementAgreed: consent.management_agreed === true
            && consent.management_consent_version === MANAGEMENT_VERSION,
          deletionRequested: Boolean(consent.deletion_requested_at),
          consentedAt: isEffective ? consent.consented_at : null,
          accessUrl: await candidateAccessUrl(admin, request, id, consent),
        })
      }
      const decision = body.decision
      if (decision !== 'approved' && decision !== 'declined'
          && decision !== 'withdrawn' && decision !== 'withdraw-all')
        return failure(headers, 400, '동의 여부를 선택해 주세요.')

      // Both categories are independent: optional guest disclosure must never
      // be required for agreeing to manage the candidate in the admin area.
      if (decision === 'approved' || decision === 'declined') {
        if (body.confirmedOwner !== true || body.useAgreed !== true
            || body.shareAgreed !== (decision === 'approved')
            || body.policyVersion !== CONSENT_VERSION
            || body.previewSignature !== await signatureOf(preview)
            || body.managementSignature !== await managementSignature(person)) {
          return failure(headers, 409, '본인 확인·관리 동의·최신 프로필을 다시 확인해 주세요.')
        }
      }
      // When the participant corrects public text, save their changes and their
      // consent in one database transaction. A stale link or profile must fail
      // closed, rather than updating people while leaving consent outdated.
      if (body.editedProfile !== undefined) {
        if (decision !== 'approved' && decision !== 'declined')
          return failure(headers, 400, '프로필 수정은 동의 선택과 함께 제출해 주세요.')
        const corrected = editableProfile(body.editedProfile, preview)
        if (!corrected) return failure(headers, 400, '수정한 프로필의 입력값을 확인해 주세요.')
        const correctedPerson: Person = { ...person,
          year: corrected.year, height: corrected.height, location: corrected.location,
          job: corrected.job, ideal_type: corrected.public_ideal_type,
          note: corrected.public_traits,
        }
        const { data: saved, error: transactionError } = await admin.rpc('submit_guest_profile_decision', {
          p_person_id: id,
          p_nonce: consent.secret_nonce,
          p_expected_profile: preview,
          p_expected_management: managementIdentity(person),
          p_expected_consent_updated_at: consent.updated_at,
          p_new_profile: corrected,
          p_decision: decision,
          p_profile_signature: decision === 'approved' ? await signatureOf(corrected) : null,
          p_consent_version: CONSENT_VERSION,
          p_management_version: MANAGEMENT_VERSION,
          p_management_summary: managementSummary(correctedPerson),
        })
        if (transactionError) return failure(headers, 503,
          '프로필 수정·동의 저장 기능이 아직 서버에 적용되지 않았어요. 주선자에게 알려주세요.')
        if (!saved) return failure(headers, 409,
          '프로필 또는 동의 상태가 바뀌었어요. 페이지를 새로고침한 뒤 다시 확인해 주세요.')
        const accessUrl = await candidateAccessUrl(admin, request, id, (await readConsent(admin, id))!)
        return output(headers, 200, {
          saved: true, decision, managementAgreed: true, deletionRequested: false,
          accessUrl, profile: corrected,
          previewSignature: await signatureOf(corrected),
          managementSignature: await managementSignature(correctedPerson),
        })
      }

      const now = new Date().toISOString()
      const managementDetails = {
        management_agreed: true,
        management_consented_at: now,
        management_consent_version: MANAGEMENT_VERSION,
        management_snapshot: managementSummary(person),
        deletion_requested_at: null,
      }
      // Never treat "declined" guest disclosure as a rejection of internal
      // candidate management; keep the two choices separately auditable.
      const next = decision === 'approved' ? {
        ...managementDetails,
        decision, profile_signature: await signatureOf(preview),
        consent_snapshot: preview, consent_version: CONSENT_VERSION,
        consented_at: now, decided_at: now, updated_at: now,
      } : decision === 'declined' ? {
        ...managementDetails,
        decision, profile_signature: null, consent_snapshot: null,
        consent_version: CONSENT_VERSION, consented_at: null,
        decided_at: now, updated_at: now,
      } : decision === 'withdrawn' ? {
        decision, profile_signature: null, consent_snapshot: null,
        consent_version: CONSENT_VERSION, consented_at: null,
        decided_at: now, updated_at: now,
      } : {
        // Request removal of already-held personal data. Deleting linked
        // people, images and match histories needs an explicit admin workflow.
        decision: 'withdrawn', profile_signature: null,
        consent_snapshot: null, consent_version: CONSENT_VERSION,
        consented_at: null, decided_at: now, updated_at: now,
        management_agreed: false, management_consented_at: null,
        management_consent_version: null, management_snapshot: null,
        deletion_requested_at: now,
      }
      const { data: saved, error } = await admin.from('guest_profile_consents')
        .update(next).eq('person_id', id).eq('secret_nonce', consent.secret_nonce)
        .select('person_id').maybeSingle()
      if (error || !saved) return failure(headers, 503, '동의 상태를 저장하지 못했어요.')
      if (decision === 'withdraw-all') {
        await admin.from('guest_access_passes').update({ revoked_at: now })
          .eq('person_id', id).is('revoked_at', null)
      }
      const accessUrl = decision === 'approved' || decision === 'declined'
        ? await candidateAccessUrl(admin, request, id, (await readConsent(admin, id))!)
        : null
      return output(headers, 200, {
        accessUrl,
        saved: true,
        decision: decision === 'withdraw-all' ? 'withdrawn' : decision,
        managementAgreed: decision === 'approved' || decision === 'declined'
          ? true : decision === 'withdraw-all' ? false : consent.management_agreed,
        deletionRequested: decision === 'withdraw-all',
      })
    }

    if (!await verifiedAdmin(request)) return failure(headers, 403, '관리자 권한이 필요해요.')
    const id = personIdFrom(body.personId)
    if (!id) return failure(headers, 400, '대상 후보를 확인해 주세요.')
    const person = await readPerson(admin, id)
    if (!person) return failure(headers, 404, '후보를 찾을 수 없어요.')
    let consent = await readConsent(admin, id)
    if (body.action === 'admin-status') {
      const isEffective = await effective(person, consent)
      return output(headers, 200, {
        hasLink: Boolean(consent), public: isEffective,
        managementAgreed: consent?.management_agreed === true
          && consent.management_consent_version === MANAGEMENT_VERSION,
        deletionRequestedAt: consent?.deletion_requested_at ?? null,
        decision: !consent ? 'pending' :
          isEffective ? 'approved' :
          consent.decision === 'approved' ? 'needs-review' : consent.decision,
        decidedAt: consent?.decided_at ?? null,
      })
    }
    if (body.action === 'admin-link') {
      if (!consent) {
        const { error } = await admin.from('guest_profile_consents')
          .upsert({ person_id: id }, { onConflict: 'person_id', ignoreDuplicates: true })
        if (error) return failure(headers, 503, '동의 링크를 준비하지 못했어요.')
        consent = await readConsent(admin, id)
      }
      if (!consent) return failure(headers, 503, '동의 링크를 준비하지 못했어요.')
      return output(headers, 200, { url: await linkResponse(request, id, consent) })
    }
    if (body.action === 'admin-rotate') {
      if (!consent) return failure(headers, 404, '먼저 동의 링크를 만들어 주세요.')
      const newNonce = crypto.randomUUID()
      const { error } = await admin.from('guest_profile_consents').update({
        secret_nonce: newNonce, decision: 'pending', profile_signature: null,
        consent_snapshot: null, consented_at: null, decided_at: null,
        updated_at: new Date().toISOString(),
      }).eq('person_id', id).eq('secret_nonce', consent.secret_nonce)
      if (error) return failure(headers, 503, '동의 링크를 갱신하지 못했어요.')
      consent = await readConsent(admin, id)
      if (!consent) return failure(headers, 503, '동의 링크를 갱신하지 못했어요.')
      return output(headers, 200, { url: await linkResponse(request, id, consent) })
    }
    if (body.action === 'admin-hide') {
      if (!consent) return failure(headers, 404, '공개 동의 기록이 없어요.')
      // Invalidate the old candidate link too: otherwise its holder could
      // immediately re-approve after the administrator intentionally hid it.
      const { error } = await admin.from('guest_profile_consents').update({
        secret_nonce: crypto.randomUUID(), decision: 'withdrawn',
        profile_signature: null, consent_snapshot: null,
        consented_at: null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('person_id', id).eq('secret_nonce', consent.secret_nonce)
      if (error) return failure(headers, 503, '공개를 중단하지 못했어요.')
      return output(headers, 200, { stopped: true })
    }
    return failure(headers, 400, '알 수 없는 요청이에요.')
  } catch {
    return failure(headers, 500, '요청을 처리하지 못했어요. 다시 시도해 주세요.')
  }
})
