/**
 * Copy and payload for the "transaction detected — approve it?" banner.
 * Pure: no React Native, so unit tests can import it.
 *
 * Channel id is frozen in the Phase 0 spec. It must stay different from
 * the due-reminder channel `WalletTrails-due-reminders`.
 */
export const DETECTED_TX_CHANNEL_ID = 'wallettrails-detected-tx'

export const DETECTED_TX_TYPE = 'bank_sms_review'

const BOOKKEEPING =
  'A new transaction was detected. Approve it so your expenses and records stay up to date.'

const COLLAPSED_BODY =
  'New transactions were detected. Approve them so your expenses and records stay up to date.'

export type DetectedTxContent = {
  title: string
  body: string
  /** Present only for a single pending draft. Omitted when several are waiting. */
  importId?: number
  data: {
    type: typeof DETECTED_TX_TYPE
    screen: 'bank-sms'
    kind: string
    source: string
    importId?: number
  }
}

export function buildDetectedTransactionContent(input: {
  id: number
  kind: string
  /** Formatted money, already including the currency symbol. Null hides the figure. */
  amountLabel: string | null
  pendingCount: number
  source: string
}): DetectedTxContent {
  const count = Math.max(1, Math.floor(input.pendingCount) || 1)
  const kind = (input.kind || 'unknown').toLowerCase()
  const source = input.source || 'unknown'

  if (count > 1) {
    const data = {
      type: DETECTED_TX_TYPE,
      screen: 'bank-sms' as const,
      kind,
      source,
    }
    return {
      title: `${count} transactions to book`,
      body: COLLAPSED_BODY,
      data,
    }
  }

  const shown = input.amountLabel?.trim() || null
  let title: string
  let body: string

  if (!shown) {
    title = kind === 'expense' ? 'New expense to book' : 'New transaction to book'
    body = BOOKKEEPING
  } else if (kind === 'income' || kind === 'reversal') {
    title = `${shown} received`
    body = 'A new transaction was detected. Approve it so this income is in your records.'
  } else if (kind === 'atm') {
    title = `${shown} cash out`
    body = 'A new transaction was detected. Approve it so this cash-out is in your records.'
  } else if (kind === 'expense') {
    title = `${shown} to book`
    body = 'A new transaction was detected. Approve it so this expense stays in your records.'
  } else {
    title = `${shown} to book`
    body = BOOKKEEPING
  }

  const data = {
    type: DETECTED_TX_TYPE,
    screen: 'bank-sms' as const,
    kind,
    source,
    importId: input.id,
  }
  return { title, body, importId: input.id, data }
}
