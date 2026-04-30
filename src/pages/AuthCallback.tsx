import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 1. 비밀번호 재설정 이벤트가 발생했는지 확인 (공식 지원 이벤트)
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/set-password', { replace: true });
        return;
      }

      // 2. 초대(invite)의 경우: 세션이 생겼을 때 URL을 다시 한번 체크
      if (event === 'SIGNED_IN' && session) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        if (hashParams.get('type') === 'invite') {
          navigate('/set-password', { replace: true });
          return;
        }
        // 일반 로그인은 메인으로
        navigate('/', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'rgba(255,255,255,0.5)' }}>
      <div>로그인 처리 중...</div>
    </div>
  )
}