# Bank SMS assist — Privacy (draft)

**Status:** Phase 0 draft (not legal advice). Expand before Play Store SMS permission (Phase 3).

## Summary

CashTrail’s **Bank SMS assist** helps turn bank transaction alerts into draft bookkeeping entries that you **Approve** or **Reject**. Nothing is posted to your wallets without confirmation.

## Phase 1 (current)

- You **paste** a message yourself (mobile or web).
- Parsing runs **in the app**.
- No SMS inbox permission is requested.
- We do not upload full SMS bodies for analytics.

## Phase 2 (current sync)

- Paste still runs the parser in the app.
- Structured draft fields (+ short snippet) sync to your CashTrail account so you can **review pending imports on web and mobile**.
- Approve/reject happens via the API; books only change after Approve.

## Phase 3 (Android auto-detect)

- Optional **READ_SMS / RECEIVE_SMS** on Android after you opt in (onboarding or Home prompt).
- Detected alerts become **pending drafts** only — Approve still required.
- iOS and web continue to use paste / review.
- Play Store: declare financial SMS use case before shipping SMS permissions publicly.

## What we do not do

- Post expenses, income, or ATM transfers without Approve  
- Use OTP or marketing messages for bookkeeping  
- Sell message content  

## What may sync (Phase 2+)

Structured fields (amount, date, type, wallet ids, short snippet) so you can review the same queue on web. See `docs/BANK_SMS_IMPORT_PHASES.md`.
