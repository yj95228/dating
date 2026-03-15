import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import Modal from '@/components/Modal'
import PersonForm from '@/components/PersonForm'
import ConfirmDialog from '@/components/ConfirmDialog'
import Lightbox from '@/components/Lightbox'
import Avatar from '@/components/Avatar'
import { getAge, RESULT_COLORS, RESULT_EMOJI } from '@/constants'
import type { PersonFormState } from '@/types'

const STATUS_BADGE: Record<string, { color: string; bg: string; border: string }> = {
  '활성': { color: '#6ee7b7', bg: 'rgba(52,211,153,0.15)', border: '#34d399' },
  '휴식중': { color: '#fde68a', bg: 'rgba(251,191,36,0.15)', border: '#fbbf24' },
  '비활성': { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)' },
}
const STATUS_EMOJI: Record<string, string> = {
  '활성': '💚', '휴식중': '💛', '비활성': '🩶',
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { people, matches, updatePerson, deactivatePerson, deletePerson } = useData()
  const [showEdit, setShowEdit] = useState(false)
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [lightbox, setLightbox] = useState<{ photos: string[]; idx: number } | null>(null)

  const person = people.find((p) => p.id === Number(id))

  if (!person) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.25)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
        <div>인물을 찾을 수 없어요</div>
      </div>
    )
  }

  const isInactive = person.status === '비활성'
  const status = person.status ?? '활성'
  const sb = STATUS_BADGE[status]
  const relatedMatches = matches.filter((m) => m.male_id === person.id || m.female_id === person.id)
  const metaParts = [
    person.year && `${person.year}년생 (${getAge(person.year)})`,
    person.height && `${person.height}cm`,
    person.location,
    person.job,
  ].filter(Boolean)

  const handleSave = async (form: PersonFormState) => {
    await updatePerson(person.id, form)
    setShowEdit(false)
  }

  const handleShare = async () => {
    const textParts = [
      person.name,
      person.year && `${person.year}년생 (${getAge(person.year)})`,
      person.height && `${person.height}cm`,
      person.location,
      person.job,
      person.note,
    ].filter(Boolean)
    const text = textParts.join('\n')

    // 사진이 있으면 File로 변환해서 공유
    if (person.photos.length > 0 && navigator.canShare) {
      try {
        const files = await Promise.all(
          person.photos.map(async (url, i) => {
            const res = await fetch(url)
            const blob = await res.blob()
            return new File([blob], `photo_${i + 1}.jpg`, { type: blob.type })
          })
        )
        if (navigator.canShare({ files })) {
          await navigator.share({ files, text })
          return
        }
      } catch (e) {
        console.error(e)
      }
    }

    // 사진 공유 안 되면 텍스트만
    if (navigator.share) {
      await navigator.share({ text })
    } else {
      await navigator.clipboard.writeText(text)
      alert('클립보드에 복사됐어요!')
    }
  }

  const handleDeactivate = async () => {
    await deactivatePerson(person.id)
    setShowConfirmDeactivate(false)
  }

  const handleDelete = async () => {
    await deletePerson(person.id)
    navigate('/people')
  }

  const genderStyle = person.gender === 'male'
    ? { color: '#c7d2fe', bg: 'rgba(129,140,248,0.2)', border: '#818cf8' }
    : { color: '#fbcfe8', bg: 'rgba(244,114,182,0.2)', border: '#f472b6' }

  const badge = (label: string, color: string, bg: string, border: string) => (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, border: `1px solid ${border}`, background: bg, color }}>
      {label}
    </span>
  )

  return (
    <div style={{ opacity: isInactive ? 0.75 : 1 }}>
      <button onClick={() => navigate(-1)} className="btn-icon"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', marginBottom: 20 }}>
        ← 목록으로
      </button>

      {/* 프로필 헤더 */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
        <Avatar
          photos={person.photos} name={person.name ?? '?'}
          gender={person.gender} pid={person.id} size={80}
          onClick={person.photos.length > 0 ? () => setLightbox({ photos: person.photos, idx: 0 }) : undefined}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
                {person.name ?? <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>이름 없음</span>}
              </div>
              {metaParts.length > 0 && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8 }}>
                  {metaParts.map((m, i) => <div key={i}>{m}</div>)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!isInactive ? (
                <>
                  <button onClick={() => setShowEdit(true)} className="btn-icon">✏️</button>
                  <button onClick={handleShare} className="btn-icon">🔗</button>
                  <button onClick={() => setShowConfirmDeactivate(true)} className="btn-icon">⏸️</button>
                </>
              ) : (
                <button onClick={() => setShowConfirmDelete(true)} className="btn-icon">🗑️</button>
              )}
            </div>
          </div>

          {/* 배지들 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {badge(person.gender === 'male' ? '남자' : '여자', genderStyle.color, genderStyle.bg, genderStyle.border)}
            {badge(`${STATUS_EMOJI[status]} ${status}`, sb.color, sb.bg, sb.border)}
            {!person.is_direct && badge('🤝 건너건너', '#c4b5fd', 'rgba(167,139,250,0.2)', '#a78bfa')}
          </div>
        </div>
      </div>

      {/* 메모 */}
      {person.note && (
        <div style={{ marginBottom: 24, background: 'rgba(168,85,247,0.08)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'rgba(196,181,253,0.8)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {person.note}
        </div>
      )}

      {/* 이상형 */}
      {person.ideal_type && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">이상형 / 조건</div>
          <div style={{ background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.15)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'rgba(251,207,232,0.8)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {person.ideal_type}
          </div>
        </div>
      )}

      {/* 사진 갤러리 */}
      {person.photos.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">사진 ({person.photos.length}장)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {person.photos.map((ph, i) => (
              <img key={i} src={ph}
                onClick={() => setLightbox({ photos: person.photos, idx: i })}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 매칭 히스토리 */}
      <div>
        <div className="section-label">매칭 히스토리 ({relatedMatches.length}건)</div>
        {relatedMatches.length === 0 ? (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', padding: '16px 0' }}>아직 매칭 기록이 없어요</div>
        ) : (
          relatedMatches.map((m) => {
            const partnerId = m.male_id === person.id ? m.female_id : m.male_id
            const partner = people.find((p) => p.id === partnerId)
            const c = RESULT_COLORS[m.result]
            const partnerGender = m.male_id === person.id ? 'female' : 'male'
            return (
              <div key={m.id} onClick={() => navigate(`/people/${partnerId}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s' }}>
                <Avatar photos={partner?.photos} name={partner?.name ?? '?'} gender={partnerGender} pid={partner?.id ?? 0} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{partner?.name ?? '이름 없음'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {[partner?.year && `${partner.year}년생`, partner?.location].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, whiteSpace: 'nowrap', color: c, background: `${c}20`, border: `1px solid ${c}50` }}>
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

      {showConfirmDeactivate && (
        <ConfirmDialog
          message={`${person.name ?? '이 인물'}을 비활성화할까요?`}
          subMessage="나중에 다시 활성화할 수 있어요"
          confirmLabel="비활성화"
          confirmColor="linear-gradient(135deg,#6366f1,#8b5cf6)"
          onConfirm={handleDeactivate}
          onCancel={() => setShowConfirmDeactivate(false)}
        />
      )}

      {showConfirmDelete && (
        <ConfirmDialog
          message={`${person.name ?? '이 인물'}을 완전히 삭제할까요?`}
          subMessage="되돌릴 수 없어요. 관련 매칭도 삭제됩니다"
          confirmLabel="완전 삭제"
          confirmColor="linear-gradient(135deg,#ef4444,#dc2626)"
          onConfirm={handleDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}

      {lightbox && (
        <Lightbox photos={lightbox.photos} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}