/** Permission + approval UX copy (Phase 0 freeze). */

export const BANK_SMS_UX = {
  permissionTitle: 'Read bank SMS?',
  permissionBody:
    'CashTrail can detect bank alerts and draft expenses, ATM cash-outs, and money received. '
    + 'Nothing is saved to your books until you approve. You can turn this off anytime in Settings.',
  permissionAllow: 'Allow',
  permissionNotNow: 'Not now',

  pasteTitle: 'Paste bank SMS',
  pasteHint:
    'Paste a bank transaction message. CashTrail will suggest the type and wallet — you approve before anything is posted.',
  pastePlaceholder: 'Paste SMS here…',
  parseButton: 'Detect transaction',

  reviewTitle: 'Review detected transaction',
  approve: 'Approve',
  reject: 'Reject',
  skip: 'Skip for now',

  atmNoCashTitle: 'No Cash wallet yet',
  atmNoCashBody:
    'This looks like an ATM withdrawal. Approving will create a Cash wallet and move the amount from your bank wallet into Cash.',
  atmCreateCash: 'Create Cash & transfer',
  atmAsExpense: 'Record as expense instead',

  settingsTitle: 'Bank SMS assist',
  settingsHint: 'Paste a bank alert to draft an expense, ATM cash-out, or money received.',
  settingsOpen: 'Paste SMS →',

  privacyBlurb:
    'Bank SMS assist drafts bookkeeping entries from alerts you paste or (on Android) opt in to detect '
    + 'via SMS and, for Meezan / NayaPay / SadaPay, via Notification access. '
    + 'Nothing posts until you Approve. OTP and marketing messages are filtered out.',
} as const

export const BANK_SMS_PRIVACY_DRAFT = `
## Bank SMS assist

CashTrail may help you turn bank transaction alerts into draft bookkeeping entries.

### What we ask
- **Paste:** You paste a message yourself. Parsing runs in the app.
- **Android SMS auto-detect:** Optional READ_SMS / RECEIVE_SMS only if you opt in (onboarding or Settings).
- **Bank app alerts:** Optional Android Notification access for Meezan / NayaPay / SadaPay when SMS is missing.

### What we do not do
- We do not post expenses or transfers without your Approve.
- We do not sell SMS or notification content.
- We do not use OTP, PIN, verification, failed, or marketing alerts for bookkeeping.

### What may sync
Structured fields only (amount, date, type, wallet id, short snippet, aliases/corrections) so you can review on web.
`.trim()
