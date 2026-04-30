import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요')
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않아요')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, background: 'linear-gradient(135deg,#e0d0ff,#ffb8d9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>
          비밀번호 설정
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 32 }}>
          앞으로 사용할 비밀번호를 설정해주세요
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 600 }}>비밀번호</div>
          <input type="password" placeholder="6자 이상" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 600 }}>비밀번호 확인</div>
          <input type="password" placeholder="한 번 더 입력" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-field" />
        </div>

        {error && (
          <div style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>{error}</div>
        )}

        <button onClick={handleSubmit} disabled={loading} className="btn-primary"
          style={{ width: '100%', padding: '14px 0', fontSize: 15, opacity: loading ? 0.5 : 1 }}>
          {loading ? '설정 중...' : '완료'}
        </button>
      </div>
    </div>
  )
}