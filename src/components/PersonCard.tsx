import { useState } from 'react'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { getAge } from '@/constants'
import type { Person } from '@/types'

const GENDER_BADGE = {
  male: { label: '남', color: '#c7d2fe', bg: 'rgba(129,140,248,0.2)', border: '#818cf8' },
  female: { label: '여', color: '#fbcfe8', bg: 'rgba(244,114,182,0.2)', border: '#f472b6' },
}
const STATUS_BADGE: Record<string, { color: string; bg: string; border: string }> = {
  '활성': { color: '#6ee7b7', bg: 'rgba(52,211,153,0.15)', border: '#34d399' },
  '휴식중': { color: '#fde68a', bg: 'rgba(251,191,36,0.15)', border: '#fbbf24' },
  '비활성': { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)' },
}
const STATUS_EMOJI: Record<string, string> = { '활성': '💚', '휴식중': '💛', '비활성': '🩶' }

interface PersonCardProps {
  person: Person
  onEdit: (p: Person) => void
  onDeactivate: (id: number) => void
  onDelete: (id: number) => void
  onPhotoClick: (photos: string[], idx: number) => void
  onClick?: () => void
}

export default function PersonCard({ person: p, onEdit, onDeactivate, onDelete, onPhotoClick, onClick }: PersonCardProps) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isInactive = p.status === '비활성'
  const status = p.status ?? '활성'
  const gb = GENDER_BADGE[p.gender]
  const sb = STATUS_BADGE[status]

  const meta = [
    p.year && `${p.year}년생 (${getAge(p.year)})`,
    p.height && `${p.height}cm`,
    p.location,
    p.job,
  ].filter(Boolean).join(' · ')

  const badgeStyle = (color: string, bg: string, border: string) => ({
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
    border: `1px solid ${border}`, background: bg, color,
  })

  return (
    <>
      <div onClick={onClick}
        style={{ opacity: isInactive ? 0.5 : 1, cursor: onClick ? 'pointer' : 'default', marginBottom: 10 }}
        className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* 아바타 */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar
              photos={p.photos} name={p.name ?? '?'} gender={p.gender} pid={p.id} size={48}
              onClick={(e) => { e?.stopPropagation(); if (p.photos.length > 0) onPhotoClick(p.photos, 0) }}
            />
            <span style={{ position: 'absolute', top: -4, left: -4, ...badgeStyle(gb.color, gb.bg, gb.border) }}>
              {gb.label}
            </span>
            {p.photos.length > 1 && (
              <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 6, background: '#1e1830', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                +{p.photos.length - 1}
              </span>
            )}
          </div>

          {/* 정보 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name ?? <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', fontSize: 13 }}>이름 없음</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                {!isInactive ? (
                  <>
                    <button onClick={() => onEdit(p)} className="btn-icon" style={{ fontSize: 12, padding: '4px 6px' }}>✏️</button>
                    <button onClick={() => setConfirmDeactivate(true)} className="btn-icon" style={{ fontSize: 12, padding: '4px 6px' }}>⏸️</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="btn-icon" style={{ fontSize: 12, padding: '4px 6px' }}>🗑️</button>
                )}
              </div>
            </div>

            {meta && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta}
              </div>
            )}

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={badgeStyle(sb.color, sb.bg, sb.border)}>
                {STATUS_EMOJI[status]} {status}
              </span>
              {!p.is_direct && (
                <span style={badgeStyle('#c4b5fd', 'rgba(167,139,250,0.2)', '#a78bfa')}>
                  🤝 건너건너
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDeactivate && (
        <ConfirmDialog
          message={`${p.name ?? '이 인물'}을 비활성화할까요?`}
          subMessage="나중에 다시 활성화할 수 있어요"
          confirmLabel="비활성화"
          confirmColor="linear-gradient(135deg,#6366f1,#8b5cf6)"
          onConfirm={() => { setConfirmDeactivate(false); onDeactivate(p.id) }}
          onCancel={() => setConfirmDeactivate(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`${p.name ?? '이 인물'}을 완전히 삭제할까요?`}
          subMessage="되돌릴 수 없어요. 관련 매칭도 삭제됩니다"
          confirmLabel="완전 삭제"
          confirmColor="linear-gradient(135deg,#ef4444,#dc2626)"
          onConfirm={() => { setConfirmDelete(false); onDelete(p.id) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}