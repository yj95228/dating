import type { createClient as CreateClient } from 'npm:@supabase/supabase-js@2.98.0'

interface InviteConfig {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  appUrl: string
}

export function createInviteHandler(config: InviteConfig, createClient: typeof CreateClient) {
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    })
    const reply = (status: number, body: Record<string, string>) =>
      new Response(JSON.stringify(body), { status, headers })
    const failure = (status: number, code: string, message: string) => reply(status, { code, message })

    try {
      const appUrl = new URL(config.appUrl)
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname)
      if ((appUrl.protocol !== 'https:' && !(local && appUrl.protocol === 'http:'))
        || appUrl.username || appUrl.password || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
        throw new Error('Invalid app origin')
      }
      headers.set('Access-Control-Allow-Origin', appUrl.origin)
      const origin = request.headers.get('origin')
      if (origin && origin !== appUrl.origin) {
        return failure(403, 'forbidden', '이 앱에서만 초대 링크를 만들 수 있어요.')
      }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') {
        headers.set('Allow', 'POST, OPTIONS')
        return failure(405, 'method_not_allowed', '지원하지 않는 요청이에요.')
      }
      if (!config.supabaseUrl || !config.anonKey || !config.serviceRoleKey) {
        throw new Error('Missing server configuration')
      }

      const authorization = request.headers.get('authorization') ?? ''
      const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
      if (!token) return failure(401, 'unauthorized', '로그인이 만료되었어요. 다시 로그인해 주세요.')

      // Never infer authorization from request metadata or an unverified JWT.
      const caller = createClient(config.supabaseUrl, config.anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { data: identity, error: authError } = await caller.auth.getUser(token)
      if (authError || !identity.user) {
        return failure(401, 'unauthorized', '로그인이 만료되었어요. 다시 로그인해 주세요.')
      }
      const { data: role, error: roleError } = await caller.rpc('current_user_role')
      if (roleError) {
        return failure(503, 'role_check_failed', '권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
      }
      if (role !== 'admin') return failure(403, 'forbidden', '관리자만 사용자를 초대할 수 있어요.')

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return failure(400, 'invalid_email', '올바른 이메일 주소를 입력해 주세요.')
      }
      const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
        ? body.email.trim().toLowerCase() : ''
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return failure(400, 'invalid_email', '올바른 이메일 주소를 입력해 주세요.')
      }

      // Only create the privileged client after validating the caller's DB role.
      const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const redirectTo = new URL('/auth/callback?next=/set-password', appUrl.origin).href
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite', email, options: { redirectTo },
      })
      // Supabase reissues pending invites and rejects already confirmed accounts.
      // Do not fall back to magiclink/recovery, which would grant account access.
      if (error) {
        if (error.code === 'email_exists' || error.code === 'user_already_exists') {
          return failure(409, 'already_registered', '이미 가입된 사용자예요. 기존 계정으로 로그인해 주세요.')
        }
        if (error.code === 'email_address_invalid' || error.code === 'validation_failed') {
          return failure(400, 'invalid_email', '올바른 이메일 주소를 입력해 주세요.')
        }
        if (error.status === 429) {
          return failure(429, 'rate_limited', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.')
        }
        return failure(502, 'invite_failed', '초대 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
      }
      if (!data.properties?.action_link) throw new Error('Missing invite link')
      return reply(200, { inviteUrl: data.properties.action_link })
    } catch {
      // Upstream errors can contain email addresses, tokens or service credentials.
      return failure(500, 'invite_failed', '초대 기능을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.')
    }
  }
}
