import { useState, useRef } from 'react'
import { S } from '@/styles'
import type { PersonFormState } from '@/types'

interface PersonFormProps {
  initial?: PersonFormState | null
  onSave: (form: PersonFormState) => void
}

const defaultForm = (): PersonFormState => ({
  name: null,
  year: null,
  location: null,
  ideal_type: null,
  note: null,
  gender: 'male',
  photos: [],
})

export default function PersonForm({ initial, onSave }: PersonFormProps) {
  const [form, setForm] = useState<PersonFormState>(() => initial ?? defaultForm())
  const photoRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof PersonFormState>(key: K, val: PersonFormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = ev.target?.result as string
        setForm((f) => ({ ...f, photos: [...f.photos, result] }))
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removePhoto = (idx: number) =>
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))

  return (
    <>
      {/* 성별 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['male', 'female'] as const).map((g) => (
          <button
            key={g}
            onClick={() => set('gender', g)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10,
              border: `1px solid ${form.gender === g ? (g === 'male' ? '#6366f1' : '#ec4899') : 'rgba(255,255,255,0.1)'}`,
              background: form.gender === g ? (g === 'male' ? 'rgba(99,102,241,0.25)' : 'rgba(236,72,153,0.25)') : 'transparent',
              color: form.gender === g ? '#f1f0ff' : '#6060a0',
              fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif",
            }}
          >
            {g === 'male' ? '👨 남자' : '👩 여자'}
          </button>
        ))}
      </div>

      {/* 사진 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 6 }}>사진 (여러 장 가능)</div>
        {form.photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {form.photos.map((ph, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={ph} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                <button onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 18, height: 18, color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => photoRef.current?.click()} style={{ ...S.iconBtn, padding: '8px 14px', fontSize: 13, border: '1px solid rgba(255,255,255,0.15)' }}>
          📷 사진 추가
        </button>
        <input ref={photoRef} type="file" accept="image/*" multiple onChange={handlePhotos} style={{ display: 'none' }} />
      </div>

      {/* 텍스트 필드 */}
      {([
        ['이름', 'name', 'text', '이름 입력 (선택)'],
        ['출생년도', 'year', 'number', '예: 1995'],
        ['거주지', 'location', 'text', '사는 곳 입력'],
      ] as const).map(([label, key, type, ph]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 5 }}>{label}</div>
          <input
            type={type}
            placeholder={ph}
            value={form[key] ?? ''}
            onChange={(e) => set(key, (e.target.value || null) as never)}
            style={S.input}
          />
        </div>
      ))}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 5 }}>이상형 / 조건</div>
        <textarea
          placeholder="원하는 스타일, 조건 등..."
          value={form.ideal_type ?? ''}
          onChange={(e) => set('ideal_type', e.target.value || null)}
          style={{ ...S.input, minHeight: 60, resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 5 }}>특징 메모</div>
        <textarea
          placeholder="성격, 특징, 기타 메모..."
          value={form.note ?? ''}
          onChange={(e) => set('note', e.target.value || null)}
          style={{ ...S.input, minHeight: 60, resize: 'vertical' }}
        />
      </div>

      <button onClick={() => onSave(form)} style={{ ...S.btnPrimary, width: '100%', padding: '12px', fontSize: 15 }}>
        저장
      </button>
    </>
  )
}