import { useState, useEffect, useRef } from 'react'

interface LightboxProps {
  photos: string[]
  startIdx: number
  onClose: () => void
}

interface TouchPosition {
  x: number
  y: number
  distance: number
}

const initialView = { scale: 1, x: 0, y: 0 }
const edgeSwipeThreshold = 50

function getTouchPosition(touches: React.TouchList): TouchPosition | null {
  if (!touches.length) return null
  const first = touches[0]
  const second = touches[1]
  return second
    ? {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
      distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
    }
    : { x: first.clientX, y: first.clientY, distance: 0 }
}

export default function Lightbox({ photos, startIdx, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIdx)
  const [view, setView] = useState(initialView)
  const viewRef = useRef(initialView)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const previousTouch = useRef<TouchPosition | null>(null)
  const swipeStart = useRef<TouchPosition | null>(null)
  const suppressSwipe = useRef(false)
  const pinchedInGesture = useRef(false)
  const edgeSwipe = useRef(false)

  const resetView = () => {
    viewRef.current = initialView
    setView(initialView)
    previousTouch.current = null
    swipeStart.current = null
    suppressSwipe.current = false
    pinchedInGesture.current = false
    edgeSwipe.current = false
  }

  useEffect(() => {
    resetView()
  }, [idx, photos[idx]])

  useEffect(() => {
    window.addEventListener('resize', resetView)
    return () => window.removeEventListener('resize', resetView)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + photos.length) % photos.length)
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % photos.length)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [photos.length, onClose])

  const onTouchStart = (event: React.TouchEvent) => {
    const position = getTouchPosition(event.touches)
    if (!previousTouch.current) {
      swipeStart.current = position
      suppressSwipe.current = viewRef.current.scale > 1
      pinchedInGesture.current = false
      edgeSwipe.current = false
    }
    if (event.touches.length > 1) {
      suppressSwipe.current = true
      pinchedInGesture.current = true
    }
    previousTouch.current = position
  }

  const onTouchMove = (event: React.TouchEvent) => {
    const current = getTouchPosition(event.touches)
    const previous = previousTouch.current
    const viewport = viewportRef.current
    const image = imageRef.current
    if (!current || !previous || !viewport || !image) return

    const oldView = viewRef.current
    const pinching = event.touches.length > 1
    if (pinching) {
      suppressSwipe.current = true
      pinchedInGesture.current = true
    }
    if (pinching || oldView.scale > 1) {
      const scale = pinching && previous.distance > 0
        ? Math.min(4, Math.max(1, oldView.scale * current.distance / previous.distance))
        : oldView.scale
      const ratio = scale / oldView.scale
      const bounds = viewport.getBoundingClientRect()
      const centerX = bounds.left + bounds.width / 2
      const centerY = bounds.top + bounds.height / 2
      const maxX = Math.max(0, (image.offsetWidth * scale - bounds.width) / 2)
      const maxY = Math.max(0, (image.offsetHeight * scale - bounds.height) / 2)
      const nextX = current.x - centerX - (previous.x - centerX - oldView.x) * ratio
      const nextY = current.y - centerY - (previous.y - centerY - oldView.y) * ratio
      if (!pinching && !pinchedInGesture.current && oldView.scale > 1) {
        const swipingPastLeftEdge = nextX < -maxX - edgeSwipeThreshold
        const swipingPastRightEdge = nextX > maxX + edgeSwipeThreshold
        edgeSwipe.current ||= swipingPastLeftEdge || swipingPastRightEdge
      }
      const nextView = {
        scale,
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      }
      viewRef.current = nextView
      setView(nextView)
    }
    previousTouch.current = current
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length) {
      previousTouch.current = getTouchPosition(event.touches)
      return
    }
    const start = swipeStart.current
    const end = getTouchPosition(event.changedTouches)
    const canSwipe = !suppressSwipe.current || (edgeSwipe.current && !pinchedInGesture.current)
    if (canSwipe && start && end && photos.length > 1) {
      const distanceX = start.x - end.x
      const distanceY = start.y - end.y
      if (Math.abs(distanceX) > edgeSwipeThreshold && Math.abs(distanceX) > Math.abs(distanceY)) {
        setIdx((currentIdx) => (currentIdx + (distanceX > 0 ? 1 : -1) + photos.length) % photos.length)
      }
    }
    previousTouch.current = null
    swipeStart.current = null
    suppressSwipe.current = false
    pinchedInGesture.current = false
    edgeSwipe.current = false
  }

  const navBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
    padding: '8px 18px', color: '#fff', fontSize: 20, cursor: 'pointer',
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ 
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', 
        zIndex: 200, display: 'flex', flexDirection: 'column', 
        alignItems: 'center', justifyContent: 'center', gap: 14,
        touchAction: 'none'
      }}
    >
      <button aria-label="사진 닫기" onClick={onClose} style={{ position: 'absolute', top: 20, right: 24, zIndex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>×</button>
      <div
        ref={viewportRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          previousTouch.current = null
          swipeStart.current = null
          suppressSwipe.current = false
          pinchedInGesture.current = false
          edgeSwipe.current = false
        }}
        style={{ width: '90vw', height: '72vh', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', userSelect: 'none' }}
      >
        <img
          ref={imageRef}
          src={photos[idx]}
          alt={`사진 ${idx + 1}`}
          draggable={false}
          onLoad={resetView}
          style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, objectFit: 'contain', transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
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
