interface ConfirmDialogProps {
    message: string
    subMessage?: string
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({ message, subMessage, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onCancel()}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
        >
            <div style={{ background: '#1a1830', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: '26px 24px', width: '100%', maxWidth: 340, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f0ff', marginBottom: subMessage ? 6 : 20 }}>{message}</div>
                {subMessage && (
                    <div style={{ fontSize: 12, color: '#7070a0', marginBottom: 20 }}>{subMessage}</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={onCancel}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#a0a0c0', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif" }}
                    >
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif" }}
                    >
                        삭제
                    </button>
                </div>
            </div>
        </div>
    )
}