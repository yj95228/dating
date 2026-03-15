import { useState } from 'react'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import MatchCard from '@/components/MatchCard'
import Avatar from '@/components/Avatar'
import { S } from '@/styles'
import { getAge } from '@/constants'
import type { MatchFormState, MatchResult, Person } from '@/types'

function PersonPickerModal({
  people,
  selected,
  onSelect,
  onClose,
  title,
}: {
  people: Person[]
  selected: string
  onSelect: (id: string) => void
  onClose: () => void
  title: string
}) {
  return (
    <Modal title={title} onClose={onClose}>
      {people.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#5050a0', fontSize: 14 }}>
          등록된 인물이 없어요
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {people.map((p) => {
            const isSelected = selected === String(p.id)
            const meta = [p.year && `${p.year}년생 (${getAge(p.year)})`, p.location].filter(Boolean).join(' · ')
            return (
              <div
                key={p.id}
                onClick={() => { onSelect(String(p.id)); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${isSelected ? '#7c3aed' : 'rgba(255,255,255,0.07)'}`,
                  background: isSelected ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              >
                <Avatar photos={p.photos} name={p.name ?? '?'} gender={p.gender} pid={p.id} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f0ff' }}>{p.name ?? '이름 없음'}</div>
                  <div style={{ fontSize: 12, color: '#7070a0', marginTop: 2 }}>{meta || '정보 없음'}</div>
                </div>
                {isSelected && <span style={{ color: '#a78bfa', fontSize: 16 }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export default function MatchesPage() {
  const { people, matches, addMatch, updateMatchResult, deleteMatch } = useData()

  const [showForm, setShowForm] = useState(false)
  const [mForm, setMForm] = useState<MatchFormState>({ maleId: '', femaleId: '', note: '' })
  const [pickerTarget, setPickerTarget] = useState<'male' | 'female' | null>(null)

  const males = people.filter((p) => p.gender === 'male')
  const females = people.filter((p) => p.gender === 'female')

  const selectedMale = people.find((p) => String(p.id) === mForm.maleId)
  const selectedFemale = people.find((p) => String(p.id) === mForm.femaleId)

  const handleSave = async () => {
    if (!mForm.maleId || !mForm.femaleId) { alert('남자와 여자를 모두 선택해주세요'); return }
    await addMatch({ male_id: Number(mForm.maleId), female_id: Number(mForm.femaleId), result: '진행중', note: mForm.note || null })
    setMForm({ maleId: '', femaleId: '', note: '' })
    setShowForm(false)
  }

  const handleDelete = async (id: number) => {
    await deleteMatch(id)
  }

  const PickerButton = ({ target, person, label }: { target: 'male' | 'female'; person?: Person; label: string }) => (
    <div>
      <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 6 }}>{label}</div>
      <div
        onClick={() => setPickerTarget(target)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
          border: `1px solid ${person ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
          background: person ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.03)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = person ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = person ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.03)')}
      >
        {person ? (
          <>
            <Avatar photos={person.photos} name={person.name ?? '?'} gender={person.gender} pid={person.id} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f0ff' }}>{person.name ?? '이름 없음'}</div>
              <div style={{ fontSize: 11, color: '#7070a0' }}>{person.year && `${person.year}년생`}</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7070a0' }}>변경 ›</span>
          </>
        ) : (
          <>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5050a0', fontSize: 16 }}>+</div>
            <span style={{ color: '#5050a0', fontSize: 14 }}>선택하기</span>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowForm(true)} className="btn-outline" style={{ marginLeft: 'auto' }}>+ 매칭 추가</button>
      </div>

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#5050a0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💌</div>
          아직 매칭 기록이 없어요
        </div>
      ) : (
        matches.map((m) => (
          <MatchCard
            key={m.id} match={m} people={people}
            onUpdateResult={(id: number, result: MatchResult) => updateMatchResult(id, result)}
            onDelete={handleDelete}
          />
        ))
      )}

      {/* 매칭 추가 모달 */}
      {showForm && (
        <Modal title="매칭 추가" onClose={() => setShowForm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PickerButton target="male" person={selectedMale} label="남자 선택" />
            <PickerButton target="female" person={selectedFemale} label="여자 선택" />

            <div>
              <div style={{ fontSize: 12, color: '#8080c0', marginBottom: 5 }}>메모</div>
              <textarea
                placeholder="첫인상, 분위기, 기타 메모..."
                value={mForm.note}
                onChange={(e) => setMForm((f) => ({ ...f, note: e.target.value }))}
                style={{ ...S.input, minHeight: 70, resize: 'vertical' }}
              />
            </div>

            <button onClick={handleSave} style={{ ...S.btnPrimary, width: '100%', padding: '12px', fontSize: 15, marginTop: 4 }}>
              매칭 추가
            </button>
          </div>
        </Modal>
      )}

      {/* 인물 선택 피커 */}
      {pickerTarget === 'male' && (
        <PersonPickerModal
          title="남자 선택"
          people={males}
          selected={mForm.maleId}
          onSelect={(id) => setMForm((f) => ({ ...f, maleId: id }))}
          onClose={() => setPickerTarget(null)}
        />
      )}
      {pickerTarget === 'female' && (
        <PersonPickerModal
          title="여자 선택"
          people={females}
          selected={mForm.femaleId}
          onSelect={(id) => setMForm((f) => ({ ...f, femaleId: id }))}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </>
  )
}