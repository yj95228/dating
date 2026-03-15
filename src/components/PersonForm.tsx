import { useState, useRef } from 'react'
import type { PersonFormState, PersonStatus } from '@/types'

interface PersonFormProps {
  initial?: PersonFormState | null
  onSave: (form: PersonFormState) => void
}

const defaultForm = (): PersonFormState => ({
  name: null, year: null, location: null, job: null, height: null,
  ideal_type: null, note: null, gender: 'male', photos: [],
  status: '활성', is_direct: true,
})

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', UPLOAD_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? '업로드 실패')
  return data.secure_url as string
}

const STATUS_OPTIONS: PersonStatus[] = ['활성', '휴식중', '비활성']
const STATUS_STYLE: Record<string, { border: string; bg: string; color: string }> = {
  '활성': { border: '#34d399', bg: 'rgba(52,211,153,0.15)', color: '#6ee7b7' },
  '휴식중': { border: '#fbbf24', bg: 'rgba(251,191,36,0.15)', color: '#fde68a' },
  '비활성': { border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' },
}

const field = (label: string, children: React.ReactNode) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
    {children}
  </div>
)

export default function PersonForm({ initial, onSave }: PersonFormProps) {
  const [form, setForm] = useState<PersonFormState>(() => initial ?? defaultForm())
  const [uploading, setUploading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof PersonFormState>(key: K, val: PersonFormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      const urls = await Promise.all(files.map(uploadToCloudinary))
      setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }))
    } catch {
      alert('사진 업로드에 실패했어요. 다시 시도해주세요.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* 성별 */}
      {field('성별',
        <div style={{ display: 'flex', gap: 8 }}>
          {(['male', 'female'] as const).map((g) => (
            <button key={g} onClick={() => set('gender', g)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                borderColor: form.gender === g ? (g === 'male' ? '#818cf8' : '#f472b6') : 'rgba(255,255,255,0.1)',
                background: form.gender === g ? (g === 'male' ? 'rgba(129,140,248,0.2)' : 'rgba(244,114,182,0.2)') : 'transparent',
                color: form.gender === g ? 'white' : 'rgba(255,255,255,0.35)',
              }}>
              {g === 'male' ? '👨 남자' : '👩 여자'}
            </button>
          ))}
        </div>
      )}

      {/* 상태 */}
      {field('상태',
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUS_OPTIONS.map((s) => {
            const st = STATUS_STYLE[s]
            const active = form.status === s
            return (
              <button key={s} onClick={() => set('status', s)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  borderColor: active ? st.border : 'rgba(255,255,255,0.1)',
                  background: active ? st.bg : 'transparent',
                  color: active ? st.color : 'rgba(255,255,255,0.35)',
                }}>
                {s === '활성' ? '💚 활성' : s === '휴식중' ? '💛 휴식중' : '🩶 비활성'}
              </button>
            )
          })}
        </div>
      )}

      {/* 관계 */}
      {field('관계',
        <div style={{ display: 'flex', gap: 8 }}>
          {([true, false] as const).map((v) => (
            <button key={String(v)} onClick={() => set('is_direct', v)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                borderColor: form.is_direct === v ? '#a78bfa' : 'rgba(255,255,255,0.1)',
                background: form.is_direct === v ? 'rgba(167,139,250,0.2)' : 'transparent',
                color: form.is_direct === v ? 'white' : 'rgba(255,255,255,0.35)',
              }}>
              {v ? '👤 직접 아는 사이' : '🤝 건너건너'}
            </button>
          ))}
        </div>
      )}

      {/* 사진 */}
      {field('사진',
        <>
          {form.photos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {form.photos.map((ph, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={ph} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <button onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', border: 'none', color: 'white', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => !uploading && photoRef.current?.click()}
            style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1, fontFamily: 'inherit' }}>
            {uploading ? '⏳ 업로드 중...' : '📷 사진 추가'}
          </button>
          <input ref={photoRef} type="file" accept="image/*" multiple onChange={handlePhotos} style={{ display: 'none' }} />
        </>
      )}

      {/* 텍스트 필드들 */}
      {([
        ['이름', 'name', 'text', '이름 입력 (선택)'],
        ['출생년도', 'year', 'number', '예: 1995'],
        ['거주지', 'location', 'text', '사는 곳 입력'],
        ['직장', 'job', 'text', '예: 스타트업, 병원, 공기업'],
        ['키', 'height', 'number', '예: 178'],
      ] as const).map(([label, key, type, ph]) =>
        field(label,
          <input type={type} placeholder={ph} value={form[key] ?? ''}
            onChange={(e) => set(key, (e.target.value || null) as never)}
            className="input-field" />
        )
      )}

      {field('이상형 / 조건',
        <textarea placeholder="원하는 스타일, 조건 등..." value={form.ideal_type ?? ''}
          onChange={(e) => set('ideal_type', e.target.value || null)}
          className="input-field" style={{ minHeight: 72, resize: 'vertical' }} />
      )}

      {field('특징 메모',
        <textarea placeholder="성격, 특징, 기타 메모..." value={form.note ?? ''}
          onChange={(e) => set('note', e.target.value || null)}
          className="input-field" style={{ minHeight: 72, resize: 'vertical' }} />
      )}

      <button onClick={() => onSave(form)} disabled={uploading}
        className="btn-primary" style={{ width: '100%', padding: '14px 0', fontSize: 15, marginTop: 8, opacity: uploading ? 0.5 : 1 }}>
        {uploading ? '업로드 중...' : '저장'}
      </button>
    </div>
  )
}