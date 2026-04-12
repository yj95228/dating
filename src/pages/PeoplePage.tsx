import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import PersonCard from '@/components/PersonCard'
import PersonForm from '@/components/PersonForm'
import type { Person, PersonFormState, GenderFilter } from '@/types'

export default function PeoplePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { people, addPerson, updatePerson, deactivatePerson, deletePerson } = useData()
  const [showFilter, setShowFilter] = useState(false)
  const [formState, setFormState] = useState<{ open: boolean; person: Person | null }>({ open: false, person: null })

  const filterG = (searchParams.get('gender') ?? 'all') as GenderFilter
  const showInactive = searchParams.get('inactive') === 'true'
  const showDirect = searchParams.get('direct')

  const setFilter = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  const openAdd = () => setFormState({ open: true, person: null })
  const openEdit = (p: Person) => setFormState({ open: true, person: p })
  const closeForm = () => setFormState({ open: false, person: null })

  const handleSave = async (form: PersonFormState) => {
    if (formState.person) await updatePerson(formState.person.id, form)
    else await addPerson(form)
    closeForm()
  }

  const base = showInactive
    ? people.filter((p) => p.status === '비활성')
    : people.filter((p) => p.status !== '비활성')

  const filtered = base
    .filter((p) => filterG === 'all' || p.gender === filterG)
    .filter((p) => showDirect === null ? true : showDirect === 'true' ? p.is_direct : !p.is_direct)

  // 적용된 필터 수 (성별 제외)
  const activeFilterCount = [showInactive, showDirect !== null].filter(Boolean).length

  const genderBtn = (label: string, value: GenderFilter, activeColor: { border: string; bg: string; color: string }) => (
    <button key={value} onClick={() => setFilter('gender', value === 'all' ? null : value)}
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

        <button onClick={openAdd} className="btn-outline" style={{ marginLeft: 'auto', flexShrink: 0 }}>+ 인물 추가</button>
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
            <div style={{ display: 'flex', gap: 6 }}>
              {filterChip('활성', !showInactive, () => setFilter('inactive', null),
                { border: '#34d399', bg: 'rgba(52,211,153,0.15)', color: '#6ee7b7' })}
              {filterChip(`🩶 비활성`, showInactive, () => setFilter('inactive', showInactive ? null : 'true'),
                { border: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' })}
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.25)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          {showInactive ? '비활성 인물이 없어요' : '등록된 인물이 없어요'}
        </div>
      ) : (
        filtered.map((p) => (
          <PersonCard key={p.id} person={p}
            onEdit={openEdit}
            onDeactivate={(id) => deactivatePerson(id)}
            onDelete={(id) => deletePerson(id)}
            onPhotoClick={() => navigate(`/people/${p.id}`)}
            onClick={() => navigate(`/people/${p.id}`)}
          />
        ))
      )}

      {formState.open && (
        <Modal title={formState.person ? '인물 수정' : '인물 추가'} onClose={closeForm}>
          <PersonForm initial={formState.person} onSave={handleSave} />
        </Modal>
      )}
    </>
  )
}