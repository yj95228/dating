// No names or match results leave the server. Both sides of every recorded
// match are mutually hidden, regardless of outcome (active, failed, successful).
export type MatchPair = { male_id: number | null; female_id: number | null }

export function hideMatchedProfiles<T extends { id: number }>(
  people: readonly T[], personId: number | null, matches: readonly MatchPair[],
): T[] {
  // A non-candidate visitor has no trustworthy match identity to filter by.
  if (personId === null) return [...people]
  const hiddenIds = new Set<number>([personId])
  for (const match of matches) {
    if (match.male_id === personId && match.female_id !== null) {
      hiddenIds.add(match.female_id)
    }
    if (match.female_id === personId && match.male_id !== null) {
      hiddenIds.add(match.male_id)
    }
  }
  return people.filter(person => !hiddenIds.has(person.id))
}
