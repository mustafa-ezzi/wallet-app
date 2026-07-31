/**
 * WhatsApp-ready invite copy for CashTrail household sharing.
 * Keep claims truthful — no Play Store claim until listing is live.
 */

export function buildHouseholdInviteMessage(opts: {
  householdName: string
  inviteCode: string
  inviterName?: string | null
}): string {
  const house = (opts.householdName || 'our household').trim()
  const code = opts.inviteCode.trim().toUpperCase()
  const who = (opts.inviterName || '').trim()

  const opener = who
    ? `${who} invited you to track shared expenses together on CashTrail.`
    : `You've been invited to track shared expenses together on CashTrail.`

  return (
    `${opener}\n\n` +
    `Household: “${house}”\n` +
    `Invite code: ${code}\n\n` +
    `Why CashTrail?\n` +
    `• Shared household ledger — everyone sees what was spent\n` +
    `• Split equal — know who owes whom, instantly\n` +
    `• Your personal wallets stay private\n` +
    `• Also track bills, loans & EMI reminders in PKR\n\n` +
    `How to join:\n` +
    `1) Install CashTrail (Android)\n` +
    `2) Open Family / Household\n` +
    `3) Tap Join and enter the code above\n\n` +
    `Fair house money. No WhatsApp IOU fights.\n` +
    `CashTrail — Follow every rupee.`
  )
}
