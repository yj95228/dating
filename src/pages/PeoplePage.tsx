import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import PersonCard from '@/components/PersonCard'
import PersonForm from '@/components/PersonForm'
import type { Person, PersonFormState, GenderFilter } from '@/types'

export default function PeoplePage() {
  const navigate = useNavigate()
  const { people, addPerson, updatePerson, deactivatePerson, deletePerson } = useData()
  const [filterG, setFilterG] = useState<GenderFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [formState, setFormState] = useState<{ open: boolean; person: Person | null }>({ open: false, person: null })

  const openAdd = () => setFormState({ open: true, person: null })
  const openEdit = (p: Person) => setFormState({ open: true, person: p })
  const closeForm = () => setFormState({ open: false, person: null })

  const handleSave = async (form: PersonFormState) => {
    if (formState.person) await updatePerson(formState.person.id, form)
    else await addPerson(form)
    closeForm()
  }

  const active = people.filter((p) => p.status !== '비활성')
  const inactive = people.filter((p) => p.status === '비활성')
  const filtered = (showInactive ? inactive : active).filter((p) => filterG === 'all' || p.gender === filterG)

  return (
    <>
      {/* 필터 + 추가 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        {(['all', 'male', 'female'] as GenderFilter[]).map((v) => {
          const isActive = filterG === v
          const color = v === 'male' ? { border: '#818cf8', bg: 'rgba(129,140,248,0.2)', text: '#c7d2fe' }
            : v === 'female' ? { border: '#f472b6', bg: 'rgba(244,114,182,0.2)', text: '#fbcfe8' }
              : { border: 'rgba(168,85,247,0.5)', bg: 'rgba(168,85,247,0.2)', text: '#d8b4fe' }
          return (
            <button key={v} onClick={() => setFilterG(v)}
              style={{
                padding: '8px 14px', borderRadius: 10, border: '1px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                borderColor: isActive ? color.border : 'rgba(255,255,255,0.1)',
                background: isActive ? color.bg : 'transparent',
                color: isActive ? color.text : 'rgba(255,255,255,0.4)',
              }}>
              {v === 'all' ? '전체' : v === 'male' ? '남자' : '여자'}
            </button>
          )
        })}
        <button onClick={openAdd} className="btn-outline" style={{ marginLeft: 'auto' }}>
          + 인물 추가
        </button>
      </div>

      {/* 비활성 토글 */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowInactive(!showInactive)}
          style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid',
            fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
            borderColor: showInactive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
            background: showInactive ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: showInactive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
          }}>
          {showInactive ? '✅ 비활성 인물 보는 중' : '🩶 비활성 인물 보기'} ({inactive.length})
        </button>
      </div>

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