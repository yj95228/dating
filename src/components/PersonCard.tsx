import { useState } from 'react'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { S } from '@/styles'
import { getAge } from '@/constants'
import type { Person } from '@/types'

const GENDER_BADGE = {
  male: { label: '남', color: '#818cf8', bg: 'rgba(99,102,241,0.2)' },
  female: { label: '여', color: '#f9a8d4', bg: 'rgba(236,72,153,0.2)' },
}

interface PersonCardProps {
  person: Person
  onEdit: (p: Person) => void
  onDelete: (id: number) => void
  onPhotoClick: (photos: string[], idx: number) => void
  onClick?: () => void
}

export default function PersonCard({ person: p, onEdit, onDelete, onPhotoClick, onClick }: PersonCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const badge = GENDER_BADGE[p.gender]
  const meta = [p.year && `${p.year}년생 (${getAge(p.year)})`, p.location].filter(Boolean).join(' · ')

  return (
    <>
      <div
        onClick={onClick}
        style={{ ...S.card, cursor: onClick ? 'pointer' : 'default', transition: 'background 0.15s' }}
        onMouseEnter={(e) => onClick && (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
        onMouseLeave={(e) => onClick && (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {/* 아바타 - 대표사진만, 사진 수 배지 */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar
              photos={p.photos} name={p.name ?? '?'} gender={p.gender} pid={p.id} size={52}
              onClick={(e) => { e?.stopPropagation(); if (p.photos.length > 0) onPhotoClick(p.photos, 0) }}
            />
            {/* 성별 배지 */}
            <span style={{ position: 'absolute', top: -4, left: -4, background: badge.bg, color: badge.color, fontSize: 9, fontWeight: 800, borderRadius: 6, padding: '1px 5px', border: `1px solid ${badge.color}40` }}>
              {badge.label}
            </span>
            {/* 사진 수 배지 */}
            {p.photos.length > 1 && (
              <span style={{ position: 'absolute', bottom: -4, right: -4, background: 'rgba(30,24,48,0.95)', color: '#a0a0c0', fontSize: 9, fontWeight: 700, borderRadius: 6, padding: '1px 5px', border: '1px solid rgba(255,255,255,0.12)' }}>
                📷{p.photos.length}
              </span>
            )}
          </div>

          {/* 정보 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f0ff' }}>
                  {p.name ?? <span style={{ color: '#5050a0', fontStyle: 'italic' }}>이름 없음</span>}
                </div>
                <div style={{ color: '#7070a0', fontSize: 12, marginTop: 3 }}>{meta || '정보 없음'}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onEdit(p)} style={S.iconBtn}>✏️</button>
                <button onClick={() => setConfirmDelete(true)} style={S.iconBtn}>🗑️</button>
              </div>
            </div>

            {p.note && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#c0b8e8', background: 'rgba(150,100,255,0.1)', borderRadius: 8, padding: '6px 10px', lineHeight: 1.5 }}>
                {p.note}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`${p.name ?? '이 인물'}을 삭제할까요?`}
          subMessage="관련 매칭도 함께 삭제됩니다"
          onConfirm={() => { setConfirmDelete(false); onDelete(p.id) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}