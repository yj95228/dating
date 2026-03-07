import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import PersonForm from '@/components/PersonForm'
import ConfirmDialog from '@/components/ConfirmDialog'
import Lightbox from '@/components/Lightbox'
import Avatar from '@/components/Avatar'
import { S } from '@/styles'
import { getAge, RESULT_COLORS, RESULT_EMOJI } from '@/constants'
import type { PersonFormState } from '@/types'

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, color: '#5a5a80', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { people, matches, updatePerson, deletePerson } = useData()

  const [showEdit, setShowEdit] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: string[]; idx: number } | null>(null)

  const person = people.find((p) => p.id === Number(id))

  if (!person) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#5050a0' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
      인물을 찾을 수 없어요
    </div>
  )

  const relatedMatches = matches.filter((m) => m.male_id === person.id || m.female_id === person.id)
  const metaParts = [person.year && `${person.year}년생 (${getAge(person.year)})`, person.location].filter(Boolean)

  const handleSave = async (form: PersonFormState) => {
    await updatePerson(person.id, form)
    setShowEdit(false)
  }

  const handleDelete = async () => {
    await deletePerson(person.id)
    navigate('/people')
  }

  return (
    <>
      <button onClick={() => navigate(-1)} style={{ ...S.iconBtn, marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px' }}>
        ← 목록으로
      </button>

      {/* 프로필 헤더 */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 28 }}>
        <Avatar
          photos={person.photos} name={person.name ?? '?'} gender={person.gender} pid={person.id} size={80}
          onClick={person.photos.length > 0 ? () => setLightbox({ photos: person.photos, idx: 0 }) : undefined}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Noto Serif KR', serif", color: '#f1f0ff' }}>
                {person.name ?? <span style={{ color: '#5050a0', fontStyle: 'italic' }}>이름 없음</span>}
              </div>
              {metaParts.length > 0 && (
                <div style={{ color: '#7070a0', fontSize: 13, marginTop: 4 }}>{metaParts.join(' · ')}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setShowEdit(true)} style={S.iconBtn}>✏️</button>
              <button onClick={() => setShowConfirmDelete(true)} style={S.iconBtn}>🗑️</button>
            </div>
          </div>

          {/* 태그 영역 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: person.gender === 'male' ? 'rgba(99,102,241,0.2)' : 'rgba(236,72,153,0.2)', color: person.gender === 'male' ? '#818cf8' : '#f9a8d4', border: `1px solid ${person.gender === 'male' ? '#6366f140' : '#ec489940'}` }}>
              {person.gender === 'male' ? '남자' : '여자'}
            </span>
          </div>
        </div>
      </div>

      {/* 메모 */}
      {person.note && (
        <div style={{ marginBottom: 24, background: 'rgba(150,100,255,0.08)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#c0b8e8', lineHeight: 1.6 }}>
          {person.note}
        </div>
      )}

      {/* 이상형 */}
      {person.ideal_type && (
        <div style={{ marginBottom: 24 }}>
          <div style={SECTION_LABEL}>이상형 / 조건</div>
          <div style={{ background: 'rgba(236,72,153,0.06)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#f9a8d4', lineHeight: 1.6, border: '1px solid rgba(236,72,153,0.15)' }}>
            {person.ideal_type}
          </div>
        </div>
      )}

      {/* 사진 갤러리 */}
      {person.photos.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={SECTION_LABEL}>사진 ({person.photos.length}장)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {person.photos.map((ph, i) => (
              <img
                key={i} src={ph}
                onClick={() => setLightbox({ photos: person.photos, idx: i })}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 매칭 히스토리 */}
      <div>
        <div style={SECTION_LABEL}>매칭 히스토리 ({relatedMatches.length}건)</div>
        {relatedMatches.length === 0 ? (
          <div style={{ color: '#5050a0', fontSize: 13, padding: '16px 0' }}>아직 매칭 기록이 없어요</div>
        ) : (
          relatedMatches.map((m) => {
            const partnerId = m.male_id === person.id ? m.female_id : m.male_id
            const partner = people.find((p) => p.id === partnerId)
            const c = RESULT_COLORS[m.result]
            return (
              <div
                key={m.id}
                onClick={() => navigate(`/people/${partnerId}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                <Avatar photos={partner?.photos} name={partner?.name ?? '?'} gender={m.male_id === person.id ? 'female' : 'male'} pid={partner?.id ?? 0} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{partner?.name ?? '이름 없음'}</div>
                  <div style={{ fontSize: 11, color: '#7070a0', marginTop: 2 }}>
                    {[partner?.year && `${partner.year}년생`, partner?.location].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: c, background: `${c}20`, border: `1px solid ${c}50`, borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  {RESULT_EMOJI[m.result]} {m.result}
                </span>
              </div>
            )
          })
        )}
      </div>

      {showEdit && (
        <Modal title="인물 수정" onClose={() => setShowEdit(false)}>
          <PersonForm initial={person} onSave={handleSave} />
        </Modal>
      )}

      {showConfirmDelete && (
        <ConfirmDialog
          message={`${person.name ?? '이 인물'}을 삭제할까요?`}
          subMessage="관련 매칭도 함께 삭제됩니다"
          onConfirm={handleDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}

      {lightbox && (
        <Lightbox photos={lightbox.photos} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}