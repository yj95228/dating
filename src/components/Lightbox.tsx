import { useState, useEffect } from 'react'

interface LightboxProps {
  photos: string[]
  startIdx: number
  onClose: () => void
}

export default function Lightbox({ photos, startIdx, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIdx)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + photos.length) % photos.length)
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % photos.length)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [photos.length, onClose])

  const navBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
    padding: '8px 18px', color: '#fff', fontSize: 20, cursor: 'pointer',
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}
    >
      <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>×</button>
      <img src={photos[idx]} style={{ maxWidth: '90vw', maxHeight: '72vh', borderRadius: 12, objectFit: 'contain' }} />
      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button style={navBtn} onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}>‹</button>
          <span style={{ color: '#a0a0c0', fontSize: 13 }}>{idx + 1} / {photos.length}</span>
          <button style={navBtn} onClick={() => setIdx((i) => (i + 1) % photos.length)}>›</button>
        </div>
      )}
    </div>
  )
}
