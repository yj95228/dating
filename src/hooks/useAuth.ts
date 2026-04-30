import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Supabase가 인증 토큰을 읽고 URL 해시(#)를 지워버리기 전에 미리 캡처해 둡니다.
        let initialHash = window.location.hash

        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            // 캡처해 둔 해시에 type=invite가 포함되어 있는지 확인
            // INITIAL_SESSION(첫 로드) 또는 SIGNED_IN(로그인 완료) 시점에 모두 체크합니다.
            const isInvite = (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && initialHash.includes('type=invite')

            if (event === 'PASSWORD_RECOVERY' || isInvite) {
                initialHash = '' // 중복 실행을 막기 위해 캡처한 해시를 비웁니다.

                // 패스워드 재설정 및 초대 수락 중에도 유저 정보를 유지하여 상단에 이메일이 표시되게 함
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