import { useState, useEffect, useCallback, useContext, createContext, ReactNode, createElement } from 'react'
import { supabase } from '@/lib/supabase'
import type { Person, Match, PersonInsert, MatchInsert, MatchResult, PersonStatus, UserRole } from '@/types'

interface DataContextValue {
  people: Person[]
  matches: Match[]
  loading: boolean
  error: string | null
  role: UserRole
  canManage: boolean
  refetch: () => Promise<void>
  addPerson: (data: PersonInsert) => Promise<void>
  updatePerson: (id: number, data: PersonInsert) => Promise<void>
  deletePerson: (id: number) => Promise<void>
  updatePersonStatus: (id: number, status: PersonStatus) => Promise<void>
  addMatch: (data: MatchInsert) => Promise<void>
  updateMatchResult: (id: number, result: MatchResult) => Promise<void>
  deleteMatch: (id: number) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children, role }: { children: ReactNode; role: UserRole }) {
  const value = useDataInternal(role)
  return createElement(DataContext.Provider, { value }, children)
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

function useDataInternal(role: UserRole): DataContextValue {
  const [people, setPeople] = useState<Person[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canManage = role === 'admin'

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const peopleQuery = canManage
        ? supabase.from('people').select('*').order('created_at', { ascending: true })
        : supabase.from('people_public').select('*').order('created_at', { ascending: true })

      const [{ data: p, error: pe }, matchResult] = await Promise.all([
        peopleQuery,
        canManage
          ? supabase.from('matches').select('*').order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as Match[], error: null }),
      ])
      const { data: m, error: me } = matchResult
      if (pe) throw pe
      if (me) throw me
      setPeople((p ?? []).map((person) => ({
        ...person,
        name: canManage && 'name' in person ? person.name : null,
        photos: canManage && 'photos' in person && Array.isArray(person.photos) ? person.photos : [],
      })) as Person[])
      setMatches(m ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했어요')
    } finally {
      setLoading(false)
    }
  }, [canManage])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addPerson = async (data: PersonInsert) => {
    if (!canManage) throw new Error('Permission denied')
    const { error } = await supabase.from('people').insert(data)
    if (error) throw error
    await fetchAll()
  }

  const updatePerson = async (id: number, data: PersonInsert) => {
    if (!canManage) throw new Error('Permission denied')
    const { photos, gender, name, year, location, job, height, ideal_type, note, status, is_direct } = data
    const { error } = await supabase.from('people')
      .update({ photos, gender, name, year, location, job, height, ideal_type, note, status, is_direct })
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deletePerson = async (id: number) => {
    if (!canManage) throw new Error('Permission denied')
    await supabase.from('matches').delete().or(`male_id.eq.${id},female_id.eq.${id}`)
    const { error } = await supabase.from('people').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const updatePersonStatus = async (id: number, status: PersonStatus) => {
    if (!canManage) throw new Error('Permission denied')
    const { error } = await supabase.from('people')
      .update({ status })
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const addMatch = async (data: MatchInsert) => {
    if (!canManage) throw new Error('Permission denied')
    const { error } = await supabase.from('matches').insert(data)
    if (error) throw error
    await fetchAll()
  }

  const updateMatchResult = async (id: number, result: MatchResult) => {
    if (!canManage) throw new Error('Permission denied')
    const { error } = await supabase.from('matches').update({ result }).eq('id', id)
    if (error) throw error
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, result } : m)))
  }

  const deleteMatch = async (id: number) => {
    if (!canManage) throw new Error('Permission denied')
    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) throw error
    setMatches((prev) => prev.filter((m) => m.id !== id))
  }

  return {
    people, matches, loading, error, role, canManage, refetch: fetchAll,
    addPerson, updatePerson, deletePerson, updatePersonStatus,
    addMatch, updateMatchResult, deleteMatch,
  }
}
