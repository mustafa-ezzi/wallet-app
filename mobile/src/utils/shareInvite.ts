/**
 * WhatsApp-ready invite copy for WalletTrails household sharing.
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
    ? `${who} invited you to track shared expenses together on WalletTrails.`
    : `You've been invited to track shared expenses together on WalletTrails.`

  return (
    `${opener}\n\n` +
    `Household: “${house}”\n` +
    `Invite code: ${code}\n\n` +
    `Why WalletTrails?\n` +
    `• Shared household ledger — everyone sees what was spent\n` +
    `• Settle up — split costs equally and see who owes whom\n` +
    `• Your personal wallets stay private\n` +
    `• Also track bills, loans & EMI reminders in PKR\n\n` +
    `How to join:\n` +
    `1) Install WalletTrails (Android)\n` +
    `2) Open Family / Household\n` +
    `3) Tap Join and enter the code above\n\n` +
    `Fair house money. No WhatsApp IOU fights.\n` +
    `WalletTrails — Follow every rupee.`
  )
}
