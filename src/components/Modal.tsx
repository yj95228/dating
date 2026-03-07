import type { ReactNode } from 'react'
import { S } from '@/styles'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
    >
      <div style={{ background: '#1a1830', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 26, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#f1f0ff', fontFamily: "'Noto Serif KR', serif" }}>{title}</h2>
          <button onClick={onClose} style={{ ...S.iconBtn, fontSize: 20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
