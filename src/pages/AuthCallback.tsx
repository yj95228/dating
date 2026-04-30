import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase가 세션을 처리하고 URL의 해시를 지우기 전에 미리 캡처합니다.
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 1. 비밀번호 재설정 이벤트가 발생했는지 확인 (공식 지원 이벤트)
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/set-password', { replace: true });
        return;
      }

      // 2. 초대(invite) 등 링크를 통한 진입
      // 컴포넌트 마운트 시 SIGNED_IN 대신 INITIAL_SESSION이 발생할 수 있으므로 session 존재 여부로 확인
      if (session) {
        if (type === 'invite') {
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