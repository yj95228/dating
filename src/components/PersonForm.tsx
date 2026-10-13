import { useState, useEffect, useRef } from 'react'
import type { PersonFormState, PersonStatus } from '@/types'
import { readPersonDraft, writePersonDraft } from '@/lib/personDraft'

interface PersonFormProps {
  initial?: PersonFormState | null
  onSave: (form: PersonFormState) => Promise<void>
  draftUserId?: string
}

const defaultForm = (): PersonFormState => ({
  name: null, year: null, location: null, job: null, height: null,
  ideal_type: null, note: null, gender: 'male', photos: [],
  status: '활성', is_direct: true,
})

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

async function resizeImage(file: File, maxPx = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이 사진을 열 수 없어요. JPG 또는 PNG 이미지로 다시 시도해 주세요.'))
    }
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('사진을 변환하지 못했어요. 다른 이미지로 다시 시도해 주세요.'))
            return
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        }, 'image/jpeg', quality)
      } catch {
        reject(new Error('사진을 처리하지 못했어요. 다른 이미지로 다시 시도해 주세요.'))
      }
    }
    img.src = url
  })
}

async function uploadToCloudinary(file: File, retries = 2): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', UPLOAD_PRESET)

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST', body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '업로드 실패')
      return data.secure_url as string
    } catch (err) {
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1))) // 1초, 2초 대기 후 재시도
    }
  }
  throw new Error('업로드 실패')
}

const STATUS_OPTIONS: PersonStatus[] = ['활성', '휴식중', '비활성']
const STATUS_STYLE: Record<string, { border: string; bg: string; color: string }> = {
  '활성': { border: '#34d399', bg: 'rgba(52,211,153,0.15)', color: '#6ee7b7' },
  '휴식중': { border: '#fbbf24', bg: 'rgba(251,191,36,0.15)', color: '#fde68a' },
  '비활성': { border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' },
}

const field = (label: string, children: React.ReactNode) => (
  <div key={label} style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
    {children}
  </div>
)

export default function PersonForm({ initial, onSave, draftUserId }: PersonFormProps) {
  const [form, setForm] = useState<PersonFormState>(() => {
    if (initial) return initial
    if (draftUserId) return readPersonDraft(draftUserId).form ?? defaultForm()
    return defaultForm()
  })

  const [draftUnavailable, setDraftUnavailable] = useState(false)
  useEffect(() => {
    if (draftUserId) {
      setDraftUnavailable(!writePersonDraft(draftUserId, { form }))
    }
  }, [form, draftUserId])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveInFlight = useRef(false)
  const handleSave = async () => {
    if (saveInFlight.current || uploading) return
    saveInFlight.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(form)
    } catch {
      setSaveError('저장하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요.')
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }
  const [uploading, setUploading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof PersonFormState>(key: K, val: PersonFormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!selectedFiles.length) return

    // 파일 앱에서는 모든 형식을 선택할 수 있으므로 업로드 전에 이미지만 추립니다.
    const files = selectedFiles.filter((file) =>
      file.type.startsWith('image/') ||
      ((!file.type || file.type === 'application/octet-stream') && /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name))
    )
    if (files.length !== selectedFiles.length) {
      alert('사진 파일만 추가할 수 있어요. 사진이 아닌 파일은 제외했어요.')
    }
    if (!files.length) return
    setUploading(true)
    try {
      const resized = await Promise.all(files.map((f) => resizeImage(f)))
      const urls = await Promise.all(resized.map(uploadToCloudinary))
      setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`업로드 실패: ${msg}`)
    } finally {
      setUploading(false)
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => !uploading && filesRef.current?.click()} disabled={uploading}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(167,139,250,0.45)', background: 'rgba(167,139,250,0.12)', color: '#ddd6fe', fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1, fontFamily: 'inherit' }}>
              {uploading ? '⏳ 업로드 중...' : '📁 최근/다운로드에서 선택'}
            </button>
            <button onClick={() => !uploading && photoRef.current?.click()} disabled={uploading}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1, fontFamily: 'inherit' }}>
              🖼️ 사진 앨범에서 선택
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            파일 선택창에서 '최근' 또는 '다운로드'를 찾아보세요. 화면과 정렬은 휴대폰에 따라 달라요.
          </div>
          <input ref={filesRef} type="file" multiple onChange={handlePhotos} style={{ display: 'none' }} />
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

      {draftUnavailable && <div role="status" style={{ color: '#fbbf24', fontSize: 12, marginTop: 8 }}>기기 임시 저장을 사용할 수 없어요. 앱을 닫기 전에 저장해 주세요.</div>}
      {saveError && <div role="alert" style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{saveError}</div>}
      <button onClick={handleSave} disabled={uploading || saving}
        className="btn-primary" style={{ width: '100%', padding: '14px 0', fontSize: 15, marginTop: 8, opacity: uploading || saving ? 0.5 : 1 }}>
        {saving ? '저장 중...' : uploading ? '업로드 중...' : '저장'}
      </button>
    </div>
  )
}
