import { getAvatarBg } from '@/constants'
import type { Gender } from '@/types'

interface AvatarProps {
  photos?: string[]
  name: string
  gender: Gender
  pid: number
  size?: number
  onClick?: (e?: React.MouseEvent) => void
}

export default function Avatar({ photos, name, gender, pid, size = 56, onClick }: AvatarProps) {
  const bg = getAvatarBg(gender, pid)
  const photo = photos?.[0]

  const sharedStyle: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.12)',
    cursor: onClick ? 'pointer' : 'default',
    flexShrink: 0,
  }

  return photo ? (
    <img src={photo} onClick={onClick} style={{ ...sharedStyle, objectFit: 'cover' }} />
  ) : (
    <div onClick={onClick} style={{ ...sharedStyle, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff' }}>
      {name?.[0] ?? '?'}
    </div>
  )
}
