interface ConfirmDialogProps {
    message: string
    subMessage?: string
    confirmLabel?: string
    confirmColor?: string
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({
    message, subMessage,
    confirmLabel = '삭제',
    confirmColor = 'linear-gradient(135deg,#ef4444,#dc2626)',
    onConfirm, onCancel
}: ConfirmDialogProps) {
    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onCancel()}
            style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        >
            <div style={{ width: '100%', maxWidth: 360, background: '#1a1830', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>{message}</div>
                {subMessage && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>{subMessage}</div>}
                {!subMessage && <div style={{ marginBottom: 20 }} />}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onCancel}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                        취소
                    </button>
                    <button onClick={onConfirm}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', background: confirmColor, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}