import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { clearPersonDraft } from '@/lib/personDraft'
import type { User } from '@supabase/supabase-js'
import type { UserRole } from '@/types'

export function useAuth() {
    const [user, setUser] = useState<User | null>(null)
    const [role, setRole] = useState<UserRole>('viewer')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Supabase가 인증 토큰을 처리하며 URL을 정리하기 전에 콜백 정보를 캡처해 둡니다.
        const initialUrl = new URL(window.location.href)
        const hashParams = new URLSearchParams(initialUrl.hash.replace(/^#/, ''))
        const type = hashParams.get('type') ?? initialUrl.searchParams.get('type')
        const next = hashParams.get('next') ?? initialUrl.searchParams.get('next')
        const shouldSetPassword = type === 'invite' || type === 'recovery' || next === '/set-password'
        let redirectHandled = false
        let authSequence = 0
        let disposed = false
        let resolvedUserId: string | null = null
        let resolvedRole: UserRole = 'viewer'
        let redirectUserId: string | null = null
        let roleTimer: ReturnType<typeof setTimeout> | undefined

        const needsPasswordSetup = (user: User) => {
            return shouldSetPassword || Boolean(user.invited_at && !user.user_metadata?.password_set)
        }

        const applyUser = (nextUser: User | null, shouldRedirect = false) => {
            if (disposed) return
            const sequence = ++authSequence
            clearTimeout(roleTimer)

            if (redirectUserId !== nextUser?.id) redirectUserId = null
            if (shouldRedirect && nextUser) redirectUserId = nextUser.id

            if (!nextUser) {
                if (resolvedUserId) clearPersonDraft(resolvedUserId)
                resolvedUserId = null
                resolvedRole = 'viewer'
                setRole('viewer')
                setUser(null)
                setLoading(false)
                return
            }

            // 같은 계정의 갱신은 화면을 유지하고, 최초 로그인/계정 변경만 화면을 초기화합니다.
            if (resolvedUserId !== nextUser.id) {
                if (resolvedUserId) clearPersonDraft(resolvedUserId)
                resolvedUserId = null
                resolvedRole = 'viewer'
                setLoading(true)
                setRole('viewer')
                setUser(null)
            }

            // Auth 콜백 밖에서 권한을 조회하고, 새 인증 이벤트가 오면 이전 결과를 무시합니다.
            roleTimer = setTimeout(() => {
                if (disposed || sequence !== authSequence) return
                void (async () => {
                    // 일시적인 통신 실패는 권한 변경이 아닙니다. 같은 계정에서 마지막으로
                    // 확인한 화면을 유지하며, 실제 데이터 접근 권한은 서버 RLS가 검사합니다.
                    let nextRole = resolvedRole
                    let roleConfirmed = false
                    try {
                        const { data, error } = await supabase.rpc('current_user_role')
                        if (error) throw error
                        nextRole = data === 'admin' ? 'admin' : 'viewer'
                        roleConfirmed = true
                    } catch {
                        if (!disposed && sequence === authSequence) {
                            console.error('Failed to refresh profile role; keeping the last confirmed permissions for this session.')
                        }
                    }

                    if (disposed || sequence !== authSequence) return

                    if (roleConfirmed && nextRole !== 'admin') clearPersonDraft(nextUser.id)

                    resolvedUserId = nextUser.id
                    resolvedRole = nextRole
                    setRole(nextRole)
                    setUser(nextUser)
                    setLoading(false)

                    if (!redirectHandled && redirectUserId === nextUser.id) {
                        redirectHandled = true
                        window.location.href = '/set-password'
                    }
                })()
            }, 0)
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            // 초기 조회보다 나중에 수신한 인증 이벤트를 우선합니다.
            if (disposed || authSequence !== 0) return
            applyUser(
                session?.user ?? null,
                Boolean(session && needsPasswordSetup(session.user)),
            )
        }).catch(() => {
            if (!disposed && authSequence === 0) applyUser(null)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const isAuthLink = event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
            const shouldRedirect = event === 'PASSWORD_RECOVERY'
                || Boolean(isAuthLink && session && needsPasswordSetup(session.user))

            applyUser(session?.user ?? null, shouldRedirect)
        })

        return () => {
            disposed = true
            authSequence += 1
            clearTimeout(roleTimer)
            subscription.unsubscribe()
        }
    }, [])

    const signOut = () => supabase.auth.signOut()

    return { user, role, isAdmin: role === 'admin', loading, signOut }
}
