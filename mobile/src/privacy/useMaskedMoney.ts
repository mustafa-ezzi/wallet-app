import { useMemo } from 'react'
import { maskedMoney } from '@/src/currency/homeCurrency'
import { fmt, fmtBalance } from '@/src/utils/format'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'
import { useAuth } from '@/src/context/AuthContext'

const MASK = '••••'

/** Format helpers that respect privacy amount masking (labels stay visible). */
export function useMaskedMoney() {
  const { amountsHidden } = usePrivacyLock()
  const { user } = useAuth()
  const maskMoney = useMemo(() => maskedMoney(user?.currency), [user?.currency])

  return {
    amountsHidden,
    fmt: (n: number | string | null | undefined) => (amountsHidden ? maskMoney : fmt(n)),
    fmtBalance: (n: number | string | null | undefined) => (amountsHidden ? maskMoney : fmtBalance(n)),
    fmtSigned: (n: number | string | null | undefined, income: boolean) => {
      if (amountsHidden) return income ? `+${maskMoney}` : `−${maskMoney}`
      const body = fmt(n)
      return income ? `+${body}` : `−${body}`
    },
    /** Soft blur style for amount Text when hidden */
    amountStyle: amountsHidden
      ? ({ opacity: 0.55, letterSpacing: 2 } as const)
      : ({} as const),
    mask: MASK,
  }
}
