import { useState, useEffect, useCallback, useContext, createContext, ReactNode, createElement } from 'react'
import { supabase } from '@/lib/supabase'
import type { Person, Match, PersonInsert, MatchInsert, MatchResult } from '@/types'

interface DataContextValue {
  people: Person[]
  matches: Match[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  addPerson: (data: PersonInsert) => Promise<void>
  updatePerson: (id: number, data: PersonInsert) => Promise<void>
  deletePerson: (id: number) => Promise<void>
  deactivatePerson: (id: number) => Promise<void>
  addMatch: (data: MatchInsert) => Promise<void>
  updateMatchResult: (id: number, result: MatchResult) => Promise<void>
  deleteMatch: (id: number) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const value = useDataInternal()
  return createElement(DataContext.Provider, { value }, children)
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

function useDataInternal(): DataContextValue {
  const [people, setPeople] = useState<Person[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: p, error: pe }, { data: m, error: me }] = await Promise.all([
        supabase.from('people').select('*').order('created_at', { ascending: true }),
        supabase.from('matches').select('*').order('created_at', { ascending: false }),
      ])
      if (pe) throw pe
      if (me) throw me
      setPeople(p ?? [])
      setMatches(m ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했어요')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addPerson = async (data: PersonInsert) => {
    const { error } = await supabase.from('people').insert(data)
    if (error) throw error
    await fetchAll()
  }

  const updatePerson = async (id: number, data: PersonInsert) => {
    const { photos, gender, name, year, location, job, height, ideal_type, note, status, is_direct } = data
    const { error } = await supabase.from('people')
      .update({ photos, gender, name, year, location, job, height, ideal_type, note, status, is_direct })
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deletePerson = async (id: number) => {
    await supabase.from('matches').delete().or(`male_id.eq.${id},female_id.eq.${id}`)
    const { error } = await supabase.from('people').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deactivatePerson = async (id: number) => {
    const { error } = await supabase.from('people')
      .update({ status: '비활성' })
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const addMatch = async (data: MatchInsert) => {
    const { error } = await supabase.from('matches').insert(data)
    if (error) throw error
    await fetchAll()
  }

  const updateMatchResult = async (id: number, result: MatchResult) => {
    const { error } = await supabase.from('matches').update({ result }).eq('id', id)
    if (error) throw error
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, result } : m)))
  }

  const deleteMatch = async (id: number) => {
    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) throw error
    setMatches((prev) => prev.filter((m) => m.id !== id))
  }

  return {
    people, matches, loading, error, refetch: fetchAll,
    addPerson, updatePerson, deletePerson, deactivatePerson,
    addMatch, updateMatchResult, deleteMatch,
  }
}