import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Gender } from '@/types'

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [userMetadata, setUserMetadata] = useState<Record<string, unknown>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null)
        setUserMetadata(data.user.user_metadata ?? {})
        const savedGender = data.user.user_metadata?.gender
        if (savedGender === 'male' || savedGender === 'female') setGender(savedGender)
      }
    })
  }, [])

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setError(null)
    if (!gender) {
      setError('성별을 선택해주세요')
      return
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요')
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않아요')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({
      password,
      data: { ...userMetadata, gender, password_set: true },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, background: 'linear-gradient(135deg,#e0d0ff,#ffb8d9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>
          비밀번호 설정
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 32, whiteSpace: 'pre-wrap' }}>
          {email ? `${email}\n계정의 비밀번호를 설정해주세요` : '앞으로 사용할 비밀번호를 설정해주세요'}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600 }}>내 성별</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'male' as const, label: '남자', color: '#818cf8', background: 'rgba(129,140,248,0.2)' },
                { value: 'female' as const, label: '여자', color: '#f472b6', background: 'rgba(244,114,182,0.2)' },
              ]).map((option) => {
                const selected = gender === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGender(option.value)}
                    style={{
                      flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid',
                      borderColor: selected ? option.color : 'rgba(255,255,255,0.1)',
                      background: selected ? option.background : 'rgba(255,255,255,0.03)',
                      color: selected ? '#fff' : 'rgba(255,255,255,0.4)',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 7 }}>
              선택한 성별의 반대 성별이 사람 목록에 기본으로 표시돼요
            </div>
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

          <button type="submit" disabled={loading} className="btn-primary"
            style={{ width: '100%', padding: '14px 0', fontSize: 15, opacity: loading ? 0.5 : 1 }}>
            {loading ? '설정 중...' : '완료'}
          </button>
        </form>
      </div>
    </div>
  )
}
