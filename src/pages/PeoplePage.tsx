import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import PersonCard from '@/components/PersonCard'
import PersonForm from '@/components/PersonForm'
import { S } from '@/styles'
import type { Person, PersonFormState, GenderFilter } from '@/types'

export default function PeoplePage() {
  const navigate = useNavigate()
  const { people, addPerson, updatePerson, deletePerson } = useData()

  const [filterG, setFilterG] = useState<GenderFilter>('all')
  const [formState, setFormState] = useState<{ open: boolean; person: Person | null }>({ open: false, person: null })

  const openAdd = () => setFormState({ open: true, person: null })
  const openEdit = (p: Person) => setFormState({ open: true, person: p })
  const closeForm = () => setFormState({ open: false, person: null })

  // ✅ 수정 버그 fix: 모달 닫기 전에 저장 완료 대기, person을 null로 만들지 않음
  const handleSave = async (form: PersonFormState) => {
    if (formState.person) {
      await updatePerson(formState.person.id, form)
    } else {
      await addPerson(form)
    }
    closeForm()
  }

  const handleDelete = async (id: number) => {
    await deletePerson(id)
  }

  const filtered = filterG === 'all' ? people : people.filter((p) => p.gender === filterG)

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {(['all', 'male', 'female'] as GenderFilter[]).map((v) => (
          <button
            key={v}
            onClick={() => setFilterG(v)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: filterG === v ? 'rgba(124,58,237,0.3)' : 'transparent', color: filterG === v ? '#c4b5fd' : '#7070a0', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif" }}
          >
            {v === 'all' ? '전체' : v === 'male' ? '남자' : '여자'}
          </button>
        ))}
        <button onClick={openAdd} style={{ ...S.btnPrimary, marginLeft: 'auto' }}>+ 추가</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#5050a0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          등록된 인물이 없어요
        </div>
      ) : (
        filtered.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            onEdit={openEdit}
            onDelete={handleDelete}
            onPhotoClick={() => navigate(`/people/${p.id}`)}
            onClick={() => navigate(`/people/${p.id}`)}
          />
        ))
      )}

      {formState.open && (
        <Modal
          title={formState.person ? '인물 수정' : '인물 추가'}
          onClose={closeForm}
        >
          <PersonForm
            initial={formState.person}
            onSave={handleSave}
          />
        </Modal>
      )}
    </>
  )
}