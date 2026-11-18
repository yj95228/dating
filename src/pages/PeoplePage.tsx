import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import PersonCard from '@/components/PersonCard'
import PersonForm from '@/components/PersonForm'
import { clearPersonDraft, readPersonDraft, writePersonDraft } from '@/lib/personDraft'
import { sortPeopleForList } from '@/constants'
import type { Person, PersonFormState, GenderFilter, PersonStatus } from '@/types'

type StatusFilter = 'all' | 'active' | 'resting' | 'inactive'

export default function PeoplePage({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { people, canManage, viewerGender, addPerson, updatePerson, updatePersonStatus, deletePerson, reorderPeople } = useData()
  const [showFilter, setShowFilter] = useState(false)
  const [sortMode, setSortMode] = useState(false)
  const [sortBusy, setSortBusy] = useState(false)
  const [sortError, setSortError] = useState('')
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragPreview, setDragPreview] = useState<{ isDirect: boolean; ids: number[] } | null>(null)
  const dragRef = useRef<{ cleanup: () => void } | null>(null)
  useEffect(() => () => { dragRef.current?.cleanup() }, [])
  const [formState, setFormState] = useState<{ open: boolean; person: Person | null }>(() => ({
    open: canManage && readPersonDraft(userId).open,
    person: null,
  }))

  const defaultGender: GenderFilter = !canManage && viewerGender === 'male'
    ? 'female'
    : !canManage && viewerGender === 'female'
      ? 'male'
      : 'all'
  const genderParam = searchParams.get('gender')
  const filterG: GenderFilter = genderParam === 'male' || genderParam === 'female' || genderParam === 'all'
    ? genderParam
    : defaultGender
  const statusParam = searchParams.get('status')
  const statusFilter: StatusFilter = searchParams.get('inactive') === 'true'
    ? 'inactive'
    : statusParam === 'all' || statusParam === 'resting' || statusParam === 'inactive'
      ? statusParam
      : 'active'
  const showInactive = statusFilter === 'inactive'
  const showDirect = searchParams.get('direct')

  const setFilter = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  const setStatusFilter = (value: StatusFilter) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('inactive')
      if (value === 'active') next.delete('status')
      else next.set('status', value)
      return next
    }, { replace: true })
  }

  const openAdd = () => {
    writePersonDraft(userId, { open: true })
    setFormState({ open: true, person: null })
  }
  const openEdit = (p: Person) => {
    writePersonDraft(userId, { open: false })
    setFormState({ open: true, person: p })
  }
  const closeForm = () => {
    if (!formState.person) writePersonDraft(userId, { open: false })
    setFormState({ open: false, person: null })
  }

  const handleSave = async (form: PersonFormState) => {
    if (formState.person) await updatePerson(formState.person.id, form)
    else {
      await addPerson(form)
      clearPersonDraft(userId)
    }
    setFormState({ open: false, person: null })
  }

  const handleStatusChange = async (id: number, status: PersonStatus) => {
    await updatePersonStatus(id, status)
  }

  const base = people.filter((p) => {
    if (statusFilter === 'active') return p.status === '활성'
    if (statusFilter === 'resting') return p.status === '휴식중'
    if (showInactive) return p.status === '비활성'
    return true
  })

  const filtered = sortPeopleForList(base
    .filter((p) => filterG === 'all' || p.gender === filterG)
    .filter((p) => showDirect === null ? true : showDirect === 'true' ? p.is_direct : !p.is_direct))

  // Preview each move locally: don't wait for the database to show the new order.
  // Save the full group in one RPC only when the user releases the handle.
  const orderFor = (isDirect: boolean) =>
    sortPeopleForList(people.filter(p => Boolean(p.is_direct) === isDirect)).map(p => p.id)

  const reorderIds = (current: number[], sourceId: number, targetId: number, after: boolean) => {
    const next = current.filter(id => id !== sourceId)
    const index = next.indexOf(targetId)
    if (index < 0) return current
    next.splice(index + (after ? 1 : 0), 0, sourceId)
    return next
  }

  const isSameOrder = (a: number[], b: number[]) =>
    a.length === b.length && a.every((id, i) => id === b[i])

  const persistOrder = async (isDirect: boolean, original: number[], next: number[]) => {
    if (isSameOrder(original, next)) {
      setDragPreview(null)
      return
    }
    setSortBusy(true)
    setSortError('')
    try {
      await reorderPeople(isDirect, next)
    } catch (err) {
      // The original people state was never changed; removing the preview rolls back.
      setSortError(err instanceof Error ? err.message : '순서를 저장하지 못했어요.')
    } finally {
      setDragPreview(null)
      setSortBusy(false)
    }
  }

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, personId: number) => {
    if (sortBusy || dragRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    const person = people.find(p => p.id === personId)
    if (!person) return
    event.preventDefault()
    event.stopPropagation()
    const isDirect = Boolean(person.is_direct)
    const pointerId = event.pointerId
    const originY = event.clientY
    const original = orderFor(isDirect)
    const visible = new Set(filtered.filter(p => Boolean(p.is_direct) === isDirect).map(p => p.id))
    let current = [...original]
    let moved = false
    setDraggingId(personId)
    setSortError('')

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
    }
    const clear = () => {
      cleanup()
      dragRef.current = null
      setDraggingId(null)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      e.preventDefault()
      if (!moved && Math.abs(e.clientY - originY) < 5) return
      moved = true
      if (e.clientY < 76) window.scrollBy(0, -12)
      else if (e.clientY > window.innerHeight - 76) window.scrollBy(0, 12)
      const target = document.elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-reorder-person]') as HTMLElement | null
      const targetId = target ? Number(target.dataset.reorderPerson) : null
      if (targetId === null || targetId === personId || !visible.has(targetId)) return
      const rect = target!.getBoundingClientRect()
      const after = e.clientY >= rect.top + rect.height / 2
      const next = reorderIds(current, personId, targetId, after)
      if (isSameOrder(current, next)) return
      current = next
      setDragPreview({ isDirect, ids: next })
    }
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      clear()
      if (moved && !isSameOrder(original, current)) {
        setDragPreview({ isDirect, ids: current })
        void persistOrder(isDirect, original, current)
      } else {
        setDragPreview(null)
      }
    }
    const onCancel = () => {
      clear()
      setDragPreview(null)
    }
    dragRef.current = { cleanup }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
  }

  const cancelDrag = () => {
    dragRef.current?.cleanup()
    dragRef.current = null
    setDraggingId(null)
    setDragPreview(null)
  }

  const keyboardMove = (personId: number, direction: -1 | 1) => {
    const person = filtered.find(p => p.id === personId)
    if (!person || sortBusy || dragRef.current) return
    const isDirect = Boolean(person.is_direct)
    const visibleGroup = filtered.filter(p => Boolean(p.is_direct) === isDirect)
    const index = visibleGroup.findIndex(p => p.id === personId)
    const target = visibleGroup[index + direction]
    if (!target) return
    const original = orderFor(isDirect)
    const next = reorderIds(original, personId, target.id, direction > 0)
    if (isSameOrder(original, next)) return
    setDragPreview({ isDirect, ids: next })
    void persistOrder(isDirect, original, next)
  }

  const previewPositions = dragPreview
    ? new Map(dragPreview.ids.map((id, index) => [id, index]))
    : null
  const displayedPeople = previewPositions
    ? [...filtered].sort((a, b) => {
      if (Boolean(a.is_direct) !== Boolean(b.is_direct)) {
        return Number(b.is_direct) - Number(a.is_direct)
      }
      if (Boolean(a.is_direct) !== dragPreview!.isDirect) return 0
      return (previewPositions.get(a.id) ?? Number.MAX_SAFE_INTEGER)
        - (previewPositions.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    })
    : filtered

  // 적용된 필터 수 (성별 제외)
  const activeFilterCount = [statusFilter !== 'all', showDirect !== null].filter(Boolean).length

  const genderBtn = (label: string, value: GenderFilter, activeColor: { border: string; bg: string; color: string }) => (
    <button key={value} onClick={() => setFilter('gender', value)}
      style={{
        padding: '8px 14px', borderRadius: 10, border: '1px solid', fontSize: 13,
        fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
        borderColor: filterG === value ? activeColor.border : 'rgba(255,255,255,0.1)',
        background: filterG === value ? activeColor.bg : 'transparent',
        color: filterG === value ? activeColor.color : 'rgba(255,255,255,0.4)',
      }}>
      {label}
    </button>
  )

  const filterChip = (label: string, active: boolean, onClick: () => void, activeColor = { border: '#a78bfa', bg: 'rgba(167,139,250,0.2)', color: '#c4b5fd' }) => (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 20, border: '1px solid', fontSize: 12,
      fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
      borderColor: active ? activeColor.border : 'rgba(255,255,255,0.12)',
      background: active ? activeColor.bg : 'rgba(255,255,255,0.03)',
      color: active ? activeColor.color : 'rgba(255,255,255,0.4)',
    }}>
      {label}
    </button>
  )

  return (
    <>
      {/* 상단 바 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {genderBtn('전체', 'all', { border: 'rgba(168,85,247,0.5)', bg: 'rgba(168,85,247,0.2)', color: '#d8b4fe' })}
          {genderBtn('남자', 'male', { border: '#818cf8', bg: 'rgba(129,140,248,0.2)', color: '#c7d2fe' })}
          {genderBtn('여자', 'female', { border: '#f472b6', bg: 'rgba(244,114,182,0.2)', color: '#fbcfe8' })}
        </div>

        <button onClick={() => setShowFilter(!showFilter)}
          style={{
            flexShrink: 0,
            padding: '8px 12px', borderRadius: 10, border: '1px solid', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            borderColor: activeFilterCount > 0 ? '#a78bfa' : 'rgba(255,255,255,0.1)',
            background: activeFilterCount > 0 ? 'rgba(167,139,250,0.2)' : 'transparent',
            color: activeFilterCount > 0 ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
          }}>
          필터 {showFilter ? '▲' : '▼'}
        </button>

        <button onClick={openAdd} className="btn-outline" style={{ display: canManage ? undefined : 'none', marginLeft: 'auto', flexShrink: 0 }}>+ 인물 추가</button>
      </div>
      {/* 필터 패널 */}
      {showFilter && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: '14px 14px', marginBottom: 12,
        }}>
          {/* 관계 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>관계</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {filterChip('전체', showDirect === null, () => setFilter('direct', null))}
              {filterChip('직접 아는 사이', showDirect === 'true', () => setFilter('direct', showDirect === 'true' ? null : 'true'))}
              {filterChip('건너건너', showDirect === 'false', () => setFilter('direct', showDirect === 'false' ? null : 'false'))}
            </div>
          </div>

          {/* 상태 */}
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>상태</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {filterChip('전체', statusFilter === 'all', () => setStatusFilter('all'),
                { border: '#a78bfa', bg: 'rgba(167,139,250,0.2)', color: '#c4b5fd' })}
              {filterChip('💚 활성', statusFilter === 'active', () => setStatusFilter('active'),
                { border: '#34d399', bg: 'rgba(52,211,153,0.15)', color: '#6ee7b7' })}
              {filterChip('💛 휴식중', statusFilter === 'resting', () => setStatusFilter('resting'),
                { border: '#fbbf24', bg: 'rgba(251,191,36,0.15)', color: '#fde68a' })}
              {filterChip(`🩶 비활성`, showInactive, () => setStatusFilter('inactive'),
                { border: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' })}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
        <span style={{ display: 'flex', flex: 1, minWidth: 0,
          flexWrap: 'wrap', alignItems: 'center', gap: '3px 7px',
          fontSize: 12, color: '#a9a3c9' }}>
          <span>{filtered.length}명</span>
          <span>· 남자 {filtered.filter(p => p.gender === 'male').length}명</span>
          <span>· 여자 {filtered.filter(p => p.gender === 'female').length}명</span>
        </span>
        {canManage && (
          <button type="button" disabled={sortBusy}
            aria-pressed={sortMode}
            onClick={() => { cancelDrag(); setSortMode(v => !v); setSortError('') }}
            style={{ padding: '8px 12px', borderRadius: 10, fontSize: 12,
              fontWeight: 700, cursor: sortBusy ? 'wait' : 'pointer', fontFamily: 'inherit',
              border: sortMode ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.13)',
              background: sortMode ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.045)',
              color: sortMode ? '#ddd6fe' : '#c4b5fd' }}>
            {sortMode ? '✓ 정렬 완료' : '↕ 순서 편집'}
          </button>
        )}
      </div>
      {sortBusy && <p role="status" style={{ color: '#c4b5fd', fontSize: 12 }}>변경한 순서를 저장하고 있어요…</p>}
      {sortError && <p role="alert" style={{ color: '#f87171', fontSize: 12 }}>{sortError}</p>}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.25)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          {showInactive ? '비활성 인물이 없어요' : '등록된 인물이 없어요'}
        </div>
      ) : (
        displayedPeople.map((p, index) => {
          const card = (
            <PersonCard key={p.id} person={p}
              people={people}
              canManage={canManage}
              onEdit={openEdit}
              onStatusChange={handleStatusChange}
              onDelete={(id) => deletePerson(id)}
              onPhotoClick={() => { if (!sortMode) navigate(`/people/${p.id}`) }}
              onClick={() => { if (!sortMode) navigate(`/people/${p.id}`) }}
            />
          )
          if (!canManage || !sortMode) return card
          return (
            <div key={p.id}>
              {(index === 0 || Boolean(displayedPeople[index - 1].is_direct) !== Boolean(p.is_direct)) && (
                <p style={{ color: '#c4b5fd', fontSize: 13, fontWeight: 700, margin: '14px 0 8px' }}>
                  {p.is_direct ? '🤝 주선자가 직접 아는 사이' : '🔗 건너건너 아는 사이'}
                </p>
              )}
              <div data-reorder-person={p.id}
                style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr)',
                  gap: 6, alignItems: 'start', borderRadius: 12,
                  border: draggingId === p.id ? '1px solid rgba(196,181,253,0.85)' : '1px solid transparent',
                  background: draggingId === p.id ? 'rgba(167,139,250,0.10)' : 'transparent',
                  opacity: draggingId === p.id ? 0.74 : 1,
                  transition: 'background 120ms ease' }}>
                <button type="button"
                  aria-label={`${p.name || '후보'} 순서 이동. 드래그하거나 방향키 위아래로 이동`}
                  title="끌어서 위치 이동 · 키보드 ↑↓"
                  disabled={sortBusy}
                  onClick={event => event.stopPropagation()}
                  onPointerDown={event => beginDrag(event, p.id)}
                  onKeyDown={event => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault()
                      keyboardMove(p.id, event.key === 'ArrowUp' ? -1 : 1)
                    }
                  }}
                  style={{ marginTop: 15, width: 30, height: 54, padding: 0,
                    touchAction: 'none', userSelect: 'none',
                    background: draggingId === p.id ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(196,181,253,0.35)', borderRadius: 9,
                    color: '#ddd6fe', fontSize: 21, fontWeight: 700,
                    cursor: draggingId === p.id ? 'grabbing' : 'grab' }}>
                  ⋮⋮
                </button>
                <div style={{ minWidth: 0, pointerEvents: 'none' }}>{card}</div>
              </div>
            </div>
          )
        })
      )}

      {canManage && formState.open && (
        <Modal title={formState.person ? '인물 수정' : '인물 추가'} onClose={closeForm}
          initialScrollTop={formState.person ? 0 : readPersonDraft(userId).scrollTop}
          onScrollPositionChange={formState.person ? undefined : (scrollTop) => { writePersonDraft(userId, { scrollTop }) }}>
          <PersonForm initial={formState.person} draftUserId={formState.person ? undefined : userId} onSave={handleSave} />
        </Modal>
      )}
    </>
  )
}
