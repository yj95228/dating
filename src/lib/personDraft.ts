import type { PersonFormState } from '@/types'

interface PersonDraft {
  open: boolean
  form: PersonFormState | null
  scrollTop: number
}

const keyFor = (userId: string) => `person_add_draft:v1:${userId}`
const emptyDraft = (): PersonDraft => ({ open: false, form: null, scrollTop: 0 })

function readForm(value: unknown): PersonFormState | null {
  if (!value || typeof value !== 'object') return null
  const form = value as Record<string, unknown>
  if (form.gender !== 'male' && form.gender !== 'female') return null
  if (!['활성', '휴식중', '비활성'].includes(String(form.status))) return null
  if (typeof form.is_direct !== 'boolean' || !Array.isArray(form.photos)) return null
  if (!form.photos.every((photo) => typeof photo === 'string')) return null
  for (const field of ['name', 'year', 'location', 'job', 'ideal_type', 'note']) {
    if (form[field] !== null && typeof form[field] !== 'string') return null
  }
  if (form.height !== null && typeof form.height !== 'number' && typeof form.height !== 'string') return null
  return form as unknown as PersonFormState
}

export function readPersonDraft(userId: string): PersonDraft {
  try {
    const saved = localStorage.getItem(keyFor(userId))
    if (saved) {
      const draft = JSON.parse(saved)
      if (!draft || typeof draft !== 'object') return emptyDraft()
      return {
        open: draft.open === true,
        form: readForm(draft.form),
        scrollTop: typeof draft.scrollTop === 'number' && Number.isFinite(draft.scrollTop)
          ? Math.max(0, draft.scrollTop) : 0,
      }
    }
  } catch { /* 저장소를 사용할 수 없어도 작성은 계속할 수 있습니다. */ }

  // 이전 버전의 같은 탭에 남아 있는 입력 내용은 첫 저장 때 계정별로 옮깁니다.
  try {
    const legacy = sessionStorage.getItem('person_form_draft')
    if (legacy) return { ...emptyDraft(), form: readForm(JSON.parse(legacy)) }
  } catch { /* 손상된 이전 초안은 무시합니다. */ }
  return emptyDraft()
}

export function writePersonDraft(userId: string, patch: Partial<PersonDraft>): boolean {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ ...readPersonDraft(userId), ...patch }))
  } catch {
    return false
  }
  try { sessionStorage.removeItem('person_form_draft') } catch { /* 이전 저장소 접근 제한 */ }
  return true
}

export function clearPersonDraft(userId: string) {
  try { localStorage.removeItem(keyFor(userId)) } catch { /* 저장소 접근 제한 */ }
  try { sessionStorage.removeItem('person_form_draft') } catch { /* 저장소 접근 제한 */ }
}
