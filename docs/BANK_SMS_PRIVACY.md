# Bank SMS assist — Privacy

**Status:** Living doc for Play Console / in-app disclosure. Not legal advice.

## Summary

CashTrail’s **Bank SMS assist** turns bank transaction alerts into **draft** bookkeeping entries. You **Approve** or **Reject** every draft. Nothing is posted to your wallets without confirmation.

## Capture modes

| Mode | Platforms | Permission |
|------|-----------|------------|
| Paste | Android, iOS, web | None |
| Auto-detect SMS | Android only (opt-in) | `RECEIVE_SMS` / `READ_SMS` |
| Wallet app notifications | Android only (opt-in) | Notification access (Listener) — **NayaPay / SadaPay** |

## What we process

- Money alerts that look like expense, ATM cash-out, money received, or reversal  
- Structured fields: amount, date, type, TID, counterparty, account mask, short snippet  
- For NayaPay / SadaPay: **posted notification title/text only**, from those two apps’ packages (`com.nayapay.app`, `com.sadapay.app`)

## What we filter out (hard ignore)

- OTP / one-time password / verification / auth codes  
- “Do not share” / PIN messages  
- Failed, declined, unsuccessful transactions  
- Marketing, promo, cashback, % offers, unsubscribe / download-app blasts  

## What we do not do

- Post expenses, income, or ATM transfers without Approve  
- Sell message content or use SMS / notifications for ads  
- Read the full SMS inbox on iOS or web  
- Read notifications from apps outside the wallet allowlist when the feature is on  
- Auto-approve drafts (including background Android capture)

## What may sync to your CashTrail account

Structured draft fields (+ short snippet), wallet aliases, and type corrections so you can review the same pending queue on web and mobile. See `docs/BANK_SMS_IMPORT_PHASES.md`.

## Play Console — SMS permission answers (draft)

Use when declaring financial SMS use case:

1. **Why SMS?** Optional Android feature to detect bank debit/credit alerts and draft bookkeeping entries the user must approve.  
2. **Core feature?** Assistive only — paste works without SMS permission on all platforms.  
3. **User control?** Opt-in onboarding / Home prompt; Settings toggle off; Approve/Reject required.  
4. **Data minimization?** Parser ignores OTP/marketing; only short structured snippets sync for cross-device review.  
5. **No silent posting?** Confirmed — books change only after explicit Approve.

## Play Console — Notification access (draft)

Use when explaining Notification Listener for digital wallets:

1. **Why?** NayaPay and SadaPay send transaction alerts as **app notifications**, not SMS.  
2. **Scope?** Allowlist only those two packages; other apps’ notifications are ignored.  
3. **User control?** Separate Settings toggle; system “Notification access” screen; Approve still required.  
4. **Not a core requirement?** Paste still works without Notification access.  
