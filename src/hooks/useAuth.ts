import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Supabase가 인증 토큰을 처리하며 URL을 정리하기 전에 콜백 정보를 캡처해 둡니다.
        const initialUrl = new URL(window.location.href)
        const hashParams = new URLSearchParams(initialUrl.hash.replace(/^#/, ''))
        const type = hashParams.get('type') ?? initialUrl.searchParams.get('type')
        const next = hashParams.get('next') ?? initialUrl.searchParams.get('next')
        const shouldSetPassword = type === 'invite' || type === 'recovery' || next === '/set-password'
        let redirectHandled = false

        const needsPasswordSetup = (user: User) => {
            return shouldSetPassword || Boolean(user.invited_at && !user.user_metadata?.password_set)
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            setLoading(false)

            if (!redirectHandled && session && needsPasswordSetup(session.user)) {
                redirectHandled = true
                window.location.href = '/set-password'
            }
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const isAuthLink = event === 'SIGNED_IN' || event === 'INITIAL_SESSION'

            if (!redirectHandled && (event === 'PASSWORD_RECOVERY' || (isAuthLink && session && needsPasswordSetup(session.user)))) {
                redirectHandled = true
                setUser(session?.user ?? null)
                window.location.href = '/set-password'
                return
            }
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    const signOut = () => supabase.auth.signOut()

    return { user, loading, signOut }
}
