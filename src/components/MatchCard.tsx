import { useState } from 'react'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { S } from '@/styles'
import { RESULTS, RESULT_COLORS, RESULT_EMOJI } from '@/constants'
import type { Match, MatchResult, Person } from '@/types'

interface MatchCardProps {
  match: Match
  people: Person[]
  onUpdateResult: (id: number, result: MatchResult) => void
  onDelete: (id: number) => void
}

export default function MatchCard({ match: m, people, onUpdateResult, onDelete }: MatchCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const male = people.find((p) => p.id === m.male_id)
  const female = people.find((p) => p.id === m.female_id)

  return (
    <>
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button onClick={() => setConfirmDelete(true)} style={{ ...S.iconBtn, fontSize: 11, padding: '3px 8px' }}>🗑️</button>
        </div>

        {/* 페어 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <Avatar photos={male?.photos} name={male?.name ?? '?'} gender="male" pid={male?.id ?? 0} size={42} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{male?.name ?? '이름 없음'}</div>
              <div style={{ fontSize: 11, color: '#7070a0' }}>{[male?.year && `${male.year}년생`, male?.location].filter(Boolean).join(' ')}</div>
            </div>
          </div>

          <div style={{ fontSize: 20, flexShrink: 0 }}>💘</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexDirection: 'row-reverse' }}>
            <Avatar photos={female?.photos} name={female?.name ?? '?'} gender="female" pid={female?.id ?? 0} size={42} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{female?.name ?? '이름 없음'}</div>
              <div style={{ fontSize: 11, color: '#7070a0' }}>{[female?.year && `${female.year}년생`, female?.location].filter(Boolean).join(' ')}</div>
            </div>
          </div>
        </div>

        {/* 결과 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {RESULTS.map((r) => {
            const active = m.result === r
            const c = RESULT_COLORS[r]
            return (
              <button
                key={r}
                onClick={() => onUpdateResult(m.id, r)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${active ? c : 'rgba(255,255,255,0.08)'}`,
                  background: active ? `${c}20` : 'rgba(255,255,255,0.03)',
                  color: active ? c : '#5050a0',
                  cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif",
                  transition: 'all 0.15s',
                }}
              >
                {RESULT_EMOJI[r]} {r}
              </button>
            )
          })}
        </div>

        {m.note && (
          <div style={{ fontSize: 12, color: '#c0b8e8', marginTop: 10, background: 'rgba(150,100,255,0.08)', borderRadius: 8, padding: '6px 10px' }}>
            {m.note}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="이 매칭을 삭제할까요?"
          onConfirm={() => { setConfirmDelete(false); onDelete(m.id) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}