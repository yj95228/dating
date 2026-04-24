import { useState, useEffect, useRef } from 'react'

interface LightboxProps {
  photos: string[]
  startIdx: number
  onClose: () => void
}

export default function Lightbox({ photos, startIdx, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIdx)
  
  // 스와이프를 위한 터치 좌표 저장 (렌더링 최적화를 위해 useRef 사용)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + photos.length) % photos.length)
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % photos.length)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [photos.length, onClose])

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null // 터치 시작 시 초기화
    touchStartX.current = e.targetTouches[0].clientX
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return
    
    const distance = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50 // 스와이프 인식 최소 픽셀 거리

    if (photos.length > 1) {
      if (distance > minSwipeDistance) {
        // 왼쪽으로 스와이프 (다음 사진)
        setIdx((i) => (i + 1) % photos.length)
      } else if (distance < -minSwipeDistance) {
        // 오른쪽으로 스와이프 (이전 사진)
        setIdx((i) => (i - 1 + photos.length) % photos.length)
      }
    }

    // 터치 종료 후 초기화
    touchStartX.current = null
    touchEndX.current = null
  }

  const navBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
    padding: '8px 18px', color: '#fff', fontSize: 20, cursor: 'pointer',
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ 
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', 
        zIndex: 200, display: 'flex', flexDirection: 'column', 
        alignItems: 'center', justifyContent: 'center', gap: 14,
        touchAction: 'none' // 모바일 브라우저의 기본 스와이프 액션(새로고침, 뒤로가기 등) 방지
      }}
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