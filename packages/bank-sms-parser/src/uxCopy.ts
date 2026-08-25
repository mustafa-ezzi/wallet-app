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
    'Phase 1 parses messages on your device after you paste them. Full SMS inbox access is not required yet. '
    + 'We do not upload raw SMS for analytics.',
} as const

export const BANK_SMS_PRIVACY_DRAFT = `
## Bank SMS assist (draft — Phase 0)

CashTrail may help you turn bank transaction alerts into draft bookkeeping entries.

### What we ask
- **Phase 1 (paste):** You paste a message yourself. Parsing runs in the app.
- **Later (Android auto-detect):** Optional permission to read financial SMS / bank notifications, only if you opt in.

### What we do not do
- We do not post expenses or transfers without your Approve.
- We do not sell SMS content.
- We do not use OTP or marketing SMS for bookkeeping.

### What may sync (Phase 2+)
Structured fields only (amount, date, type, wallet id, short snippet) so you can review on web. Full inbox is never required on iOS or web.
`.trim()
