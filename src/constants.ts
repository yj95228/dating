import type { MatchResult } from '@/types'

export const RESULTS: MatchResult[] = ['진행중', '성공', '실패']

export const RESULT_COLORS: Record<MatchResult, string> = {
  '진행중': '#f59e0b',
  '성공': '#ec4899',
  '실패': '#6b7280',
}

export const RESULT_EMOJI: Record<MatchResult, string> = {
  '진행중': '⏳',
  '성공': '💕',
  '실패': '✖',
}

const MALE_GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#818cf8)',
  'linear-gradient(135deg,#3b82f6,#60a5fa)',
  'linear-gradient(135deg,#0ea5e9,#38bdf8)',
]

const FEMALE_GRADIENTS = [
  'linear-gradient(135deg,#ec4899,#f9a8d4)',
  'linear-gradient(135deg,#f43f5e,#fb7185)',
  'linear-gradient(135deg,#a855f7,#d8b4fe)',
]

export const getAge = (year: string | null): string =>
  year ? `${new Date().getFullYear() - Number(year) + 1}살` : ''

export const getAvatarBg = (gender: 'male' | 'female', id: number): string =>
  (gender === 'male' ? MALE_GRADIENTS : FEMALE_GRADIENTS)[id % 3]