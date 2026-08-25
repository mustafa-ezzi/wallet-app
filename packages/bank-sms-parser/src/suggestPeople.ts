/** Lightweight People name match for RAAST counterparties (Phase 5 optional). */

export type PersonLike = { id: number; name: string }

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Suggest a People contact when SMS counterparty loosely matches a name.
 * Returns null when ambiguous or no match.
 */
export function suggestPeopleMatch(
  counterparty: string | null | undefined,
  people: PersonLike[],
): PersonLike | null {
  if (!counterparty || !people.length) return null
  const key = normName(counterparty)
  if (key.length < 3) return null

  const hits = people.filter((p) => {
    const n = normName(p.name)
    if (!n) return false
    return n.includes(key) || key.includes(n) || n.startsWith(key.slice(0, Math.min(6, key.length)))
  })
  if (hits.length === 1) return hits[0]
  // Exact-ish: prefer shortest name containment
  const exact = hits.filter((p) => {
    const n = normName(p.name)
    return n === key || n.includes(key) || key.includes(n)
  })
  if (exact.length === 1) return exact[0]
  return null
}
