export function toMoney(n: number | string | null | undefined): number {
  if (n == null || n === '') return 0
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/,/g, ''))
  return Number.isFinite(num) ? num : 0
}

export function fmtNum(n: number | string | null | undefined): string {
  const num = toMoney(n)
  return Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function fmt(n: number | string | null | undefined): string {
  return `PKR ${fmtNum(n)}`
}

export function fmtBalance(n: number | string | null | undefined): string {
  const num = toMoney(n)
  if (num < 0) return `Deficit PKR ${fmtNum(num)}`
  return `PKR ${fmtNum(num)}`
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function mutationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function sumMoney<T>(rows: T[], pick: (row: T) => number | string | null | undefined): number {
  return rows.reduce((s, row) => s + toMoney(pick(row)), 0)
}
