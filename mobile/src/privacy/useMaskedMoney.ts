import { fmt, fmtBalance } from '@/src/utils/format'
import { usePrivacyLock } from '@/src/privacy/PrivacyLockContext'

const MASK = '••••'
const MASK_MONEY = `PKR ${MASK}`

/** Format helpers that respect privacy amount masking (labels stay visible). */
export function useMaskedMoney() {
  const { amountsHidden } = usePrivacyLock()

  return {
    amountsHidden,
    fmt: (n: number | string | null | undefined) => (amountsHidden ? MASK_MONEY : fmt(n)),
    fmtBalance: (n: number | string | null | undefined) => (amountsHidden ? MASK_MONEY : fmtBalance(n)),
    fmtSigned: (n: number | string | null | undefined, income: boolean) => {
      if (amountsHidden) return income ? `+${MASK_MONEY}` : `−${MASK_MONEY}`
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
