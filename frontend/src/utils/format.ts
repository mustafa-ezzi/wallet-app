/**
 * Format just the number with commas, no currency prefix.
 * e.g. 5000 → "5,000"
 */
export function fmtNum(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  return Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Format a positive money amount as PKR with commas.
 * Always shows absolute value — use when the UI already shows +/− separately.
 * e.g. 5000 → "PKR 5,000"
 */
export function fmt(n: number | string | null | undefined): string {
  return `PKR ${fmtNum(n)}`
}

/**
 * Format an account / net balance.
 * Negative amounts show as a clear deficit instead of a bare minus.
 * e.g.  5000 → "PKR 5,000"
 * e.g. -5000 → "Deficit PKR 5,000"
 */
export function fmtBalance(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (num < 0) return `Deficit PKR ${fmtNum(num)}`
  return `PKR ${fmtNum(num)}`
}
