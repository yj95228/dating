import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
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

        const needsPasswordSetup = (user: User) => {
            return shouldSetPassword || Boolean(user.invited_at && !user.user_metadata?.password_set)
        }

        const applyUser = async (nextUser: User | null, shouldRedirect = false) => {
            const sequence = ++authSequence

            // 계정이 바뀌는 동안 이전 사용자의 관리자 화면/데이터가 남지 않게 막습니다.
            setLoading(true)
            setRole('viewer')

            if (!nextUser) {
                setUser(null)
                setLoading(false)
                return
            }

            const { data, error } = await supabase.rpc('current_user_role')

            if (sequence !== authSequence) return

            if (error) {
                console.error('Failed to load profile role:', error.message)
            }

            setRole(data === 'admin' ? 'admin' : 'viewer')
            setUser(nextUser)
            setLoading(false)

            if (!redirectHandled && shouldRedirect) {
                redirectHandled = true
                window.location.href = '/set-password'
            }
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            void applyUser(
                session?.user ?? null,
                Boolean(session && needsPasswordSetup(session.user)),
            )
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const isAuthLink = event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
            const shouldRedirect = event === 'PASSWORD_RECOVERY'
                || Boolean(isAuthLink && session && needsPasswordSetup(session.user))

            // Auth 콜백 안에서 다른 Supabase 요청을 직접 기다리지 않습니다.
            setTimeout(() => {
                void applyUser(session?.user ?? null, shouldRedirect)
            }, 0)
        })

        return () => {
            authSequence += 1
            subscription.unsubscribe()
        }
    }, [])

    const signOut = () => supabase.auth.signOut()

    return { user, role, isAdmin: role === 'admin', loading, signOut }
}
