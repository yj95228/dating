export type Gender = 'male' | 'female'
export type MatchResult = '진행중' | '성공' | '실패'
export type PersonStatus = '활성' | '휴식중' | '비활성'

export interface Person {
  id: number
  created_at: string
  name: string | null
  gender: Gender
  year: string | null
  location: string | null
  job: string | null
  height: number | null
  ideal_type: string | null
  note: string | null
  photos: string[]
  status: PersonStatus
  is_direct: boolean
}

export interface Match {
  id: number
  created_at: string
  male_id: number
  female_id: number
  result: MatchResult
  note: string | null
}

export type PersonInsert = Omit<Person, 'id' | 'created_at'>
export type MatchInsert = Omit<Match, 'id' | 'created_at'>
export type PersonFormState = Omit<Person, 'id' | 'created_at'>

export interface MatchFormState {
  maleId: string
  femaleId: string
  note: string
}

export type GenderFilter = 'all' | 'male' | 'female'