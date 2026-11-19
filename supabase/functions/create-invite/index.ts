// New viewer invitations are retired. Keep the endpoint as an explicit 410
// response so old clients get a clear result rather than an accidental 404.
// Existing accounts and previously issued Auth links are not modified.
Deno.serve(request => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  })
  const permitted = new Set(['https://dating-note.vercel.app',
    Deno.env.get('APP_URL') ?? '',
    Deno.env.get('APP_PREVIEW_URL') ?? ''])
  const origin = request.headers.get('Origin')
  if (origin && permitted.has(origin)) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  return new Response(JSON.stringify({
    code: 'retired',
    message: '사용자 계정 초대 기능이 종료됐어요. 비회원 공유 링크를 이용해 주세요.',
  }), { status: 410, headers })
})
