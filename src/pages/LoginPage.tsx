import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async () => {
        if (!email || !password) { setError('이메일과 비밀번호를 입력해주세요'); return }
        setLoading(true)
        setError(null)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError('이메일 또는 비밀번호가 틀렸어요')
        setLoading(false)
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
            <div style={{ width: '100%', maxWidth: 360 }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>💘</div>
                    <h1 style={{ margin: 0, fontSize: 22, fontFamily: "'Noto Serif KR', serif", background: 'linear-gradient(135deg,#c4b5fd,#f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        소개팅 주선 노트
                    </h1>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#5a5a80' }}>로그인하고 시작하세요</p>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 6 }}>이메일</div>
                        <input type="email" placeholder="이메일 입력" value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#f1f0ff', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 6 }}>비밀번호</div>
                        <input type="password" placeholder="비밀번호 입력" value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#f1f0ff', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                    </div>

                    {error && (
                        <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '8px 12px' }}>
                            {error}
                        </div>
                    )}

                    <button onClick={handleLogin} disabled={loading}
                        style={{ marginTop: 4, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#ec4899)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit' }}>
                        {loading ? '로그인 중...' : '로그인'}
                    </button>
                </div>
            </div>
        </div>
    )
}