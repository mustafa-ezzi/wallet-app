# Bank SMS assist — Privacy (draft)

**Status:** Phase 0 draft (not legal advice). Expand before Play Store SMS permission (Phase 3).

## Summary

CashTrail’s **Bank SMS assist** helps turn bank transaction alerts into draft bookkeeping entries that you **Approve** or **Reject**. Nothing is posted to your wallets without confirmation.

## Phase 1 (current)

- You **paste** a message yourself (mobile or web).
- Parsing runs **in the app**.
- No SMS inbox permission is requested.
- We do not upload full SMS bodies for analytics.

## Later (Android auto-detect — Phase 3)

- Optional permission to read **financial** SMS / bank notifications, only after you opt in (onboarding for new users; one-time prompt for existing users).
- Detected alerts become **pending drafts** only.
- iOS and web will continue to use paste / share / review — they cannot read the SMS inbox.

## What we do not do

- Post expenses, income, or ATM transfers without Approve  
- Use OTP or marketing messages for bookkeeping  
- Sell message content  

## What may sync (Phase 2+)

Structured fields (amount, date, type, wallet ids, short snippet) so you can review the same queue on web. See `docs/BANK_SMS_IMPORT_PHASES.md`.
