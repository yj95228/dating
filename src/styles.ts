import type { CSSProperties } from 'react'

export const S: Record<string, CSSProperties> = {
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#f1f0ff',
    fontSize: 14,
    outline: 'none',
    fontFamily: "'Noto Sans KR', sans-serif",
    boxSizing: 'border-box',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
    border: 'none',
    borderRadius: 10,
    padding: '9px 18px',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  iconBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: 'none',
    borderRadius: 8,
    padding: '5px 9px',
    cursor: 'pointer',
    color: '#c0b8e8',
    fontSize: 13,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '16px 18px',
    marginBottom: 10,
  },
}
