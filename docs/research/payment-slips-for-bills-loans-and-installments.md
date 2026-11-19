# WalletTrails — Payment Slips for Loans, Installments, and Money Owed (Research & Phases)

**Document type:** Product + engineering plan (nothing built yet)  
**Surfaces:** Android app first (`mobile/app/(tabs)/bills.tsx`), web later (`frontend/src/pages/Expenses.tsx`)  
**Related code:** `backend/api/models.py` (`PayableInstallment`, `ReceivableInstallment`, `Project`, `Transaction`), `mobile/src/utils/reportPdf.ts` (existing PDF export), `mobile/src/config/RemoteConfigContext.tsx` (`store_url`)  
**Reviewed:** 19 November 2026

---

## 1. What I understood

### 1.1 The goal

Add a **Slip** button to bills and loans. A slip is a professional PDF payment record that shows:

- who the slip is for (your name),
- who the other side is (the loan or the person who owes you),
- a table of every payment made or received so far,
- the remaining amount at the end of the table,
- a footer that says "Generated with WalletTrails" with the WalletTrails logo.

The PDF can be shared from the phone (WhatsApp, email, and so on), together with the WalletTrails Play Store link. The link will be provided later.

### 1.2 Where the Slip button goes

The Bills screen has two tabs, and each tab has two kinds of records:

| Bills tab | Record type in the app | Backend model | Slip wording |
| --- | --- | --- | --- |
| **Money you owe** | Loan / payable with installments | `PayableInstallment` | "Payment made on [date]" and "Remaining to pay" |
| **Money you owe** | Monthly cost (rent, internet) | `RecurringExpense` | Not in scope for v1 (see §3.6) |
| **Owed to you** | Installment plan | `ReceivableInstallment` | "Payment received on [date]" and "Remaining to receive" |
| **Owed to you** | One-time payment (can be paid in parts) | `Project` (`one_time`) | "Payment received on [date]" and "Remaining to receive" |

### 1.3 Changes to the loan card ("Money you owe")

- **Remove** the **Mark Complete** button.
- **Add** a **Slip** button.
- Tapping **Slip** opens the payment history: which payments were already paid, and the remaining amount. From there the user can generate and share the PDF.

### 1.4 After recording a payment

When the user records a payment (loan) or a receipt (owed to you), the app asks:

> **Payment saved. Generate a slip for this payment?**  
> [Not now] [Generate slip]

**Generate slip** creates the PDF straight away, with the new payment included and highlighted.

### 1.5 What the slip looks like (v1 template)

```
┌──────────────────────────────────────────────────────────┐
│  [logo] WalletTrails                 PAYMENT SLIP        │
│                                      Slip # WT-P12-0004  │
│                                      19 Nov 2026         │
├──────────────────────────────────────────────────────────┤
│  Prepared by           Muhammad Ali                      │
│  Loan / payable        Bike loan — Honda CD70            │
│  Total amount          PKR 120,000                       │
├──────────────────────────────────────────────────────────┤
│  S.No │ Payment date  │ Payment                          │
│  1    │ 05 Sep 2026   │ PKR 10,000                       │
│  2    │ 05 Oct 2026   │ PKR 10,000                       │
│  3    │ 05 Nov 2026   │ PKR 10,000   ← this payment       │
├──────────────────────────────────────────────────────────┤
│                     Total paid       PKR 30,000          │
│                     Remaining        PKR 90,000          │
├──────────────────────────────────────────────────────────┤
│  [logo] Generated with WalletTrails                      │
│  Get the app: <Play Store link>                          │
└──────────────────────────────────────────────────────────┘
```

For **Owed to you**, the labels change: "Prepared by" stays as your name, the second line becomes **"Owed by"** (the person or project name), the column header reads **"Payment received"**, and the bottom rows read **"Total received"** and **"Remaining to receive"**.

### 1.6 Later

More slip templates (for example Classic, Minimal, Receipt-style, Urdu/bilingual). The v1 code should be built so a new template can be added without touching the Bills screen.

---

## 2. What already exists (so we don't rebuild it)

| Need | Already in the codebase | Notes |
| --- | --- | --- |
| Make a PDF on the phone | `expo-print` (`Print.printToFileAsync`) | Used by `mobile/src/utils/reportPdf.ts` |
| Share the PDF | `expo-sharing` (`Sharing.shareAsync`) | Same file; already handles Android and web |
| Branded PDF styling | `reportPdf.ts` uses the WalletTrails green band, table, and footer | The slip should share its colors so all PDFs look like one family |
| Play Store link without an app update | `store_url` in remote config (`AppRemoteConfig`, editable in Ops → **Ads & Config**) | The slip reads it at share time; fallback is `https://play.google.com/store/apps/details?id=com.wallettrails.android` (already used in `ForceUpdateGate.tsx`) |
| Payments linked to a loan or plan | `Transaction.linked_payable`, `Transaction.linked_receivable`, `Transaction.linked_project` | These are the rows of the slip table |
| Remaining amount | `PayableInstallment.remaining_amount`, `ReceivableInstallment.remaining_amount`, `Project.remaining_amount` | The slip must use the same math so the numbers match the card |
| Loan auto-completes | `Transaction._update_installments()` sets the loan to `completed` when paid in full | This is why removing **Mark Complete** is safe (see §3.1) |

**Missing today:** the transactions API cannot list "all payments for loan #12". It filters by type, wallet, month, and year only. Phase 1 adds this.

---

## 3. Suggestions and things to decide

### 3.1 Removing "Mark Complete" — safe, with one gap

Today **Mark Complete** only changes the loan's status to `completed`. It does **not** record any money. So a loan marked complete this way can still show "Remaining: PKR 90,000", and its slip would look wrong.

Recording payments already completes a loan automatically when it is fully paid, so the button is not needed for the normal case.

**The gap:** some users use Mark Complete when a loan was forgiven or settled outside the app. Suggestion: keep that ability, but move it out of the main row into the **Edit** sheet as **"Close loan without payment"**, with a clear warning. The slip for such a loan shows a line "Closed on [date] without full payment".

**Existing data:** loans that were already marked complete without full payment should still open a slip. It shows the real payments and the real remaining amount, plus the "Closed" line.

### 3.2 Show the Slip button on completed loans too

The **Record Payment** button hides once a loan is complete, but the **Slip** button should stay. A "paid in full" slip (Remaining: PKR 0, with a **PAID IN FULL** stamp) is the most useful slip of all, because it is proof the loan is finished.

### 3.3 Name on the slip

- **Your name:** use the profile first and last name. If it is empty, use the username. Let the user edit the name on the preview screen before generating, and remember that choice on the device.
- **Other side's name:** today a loan only has a `name` (for example "Bike loan"), not the lender's name. Suggestion for a later phase: add an optional **"Lender / borrower name"** field to loans and installment plans. v1 uses the existing name.

### 3.4 Slip number and generated time

Add a **slip number** (for example `WT-P12-0004` = loan 12, 4th slip) and the **generated date and time**. If a payment is edited or deleted later, an old slip will no longer match the app. The number and timestamp make it clear which version the other person is looking at.

v1 can build the number from the loan id and the payment count, so no new database table is needed.

### 3.5 The numbers must always add up

The slip table must use **exactly** the same set of payments as the remaining amount on the card:

- **Loans:** expense transactions with `linked_payable = loan`.
- **Installment plans:** income transactions with `linked_receivable = plan`, **plus** income linked to the same project (this is how `ReceivableInstallment.amount_received` works today).
- **One-time payments:** income linked to the project, **plus** the **advance already received** (`advance_amount`), which should appear as its own first row called "Advance".

So the rule is: **Total − sum of table = Remaining.** A backend test enforces this (Phase 1).

### 3.6 Monthly costs (rent, internet)

You didn't mention them, and their "remaining" resets every month, so a slip is less meaningful. Suggestion: leave them out of v1. A "monthly receipt" template could be added later.

### 3.7 Plans (Free / Plus / Pro) — needs your decision

`docs/research/free-plus-pro-plans-what-is-included.md` lists **PDF export as Pro only**. A slip is a PDF, so there are two options:

- **Option A (suggested):** slips are **free for everyone**. Every shared slip carries the WalletTrails logo and Play Store link, so each one advertises the app. Later, a Plus or Pro benefit could be extra templates, or removing the footer branding.
- **Option B:** slips follow the PDF rule and are Pro only.

### 3.8 Privacy

- If **Hide amounts** is on, the slip preview should ask for the PIN or fingerprint first, the same way balances are revealed.
- The PDF is created on the phone. Nothing is uploaded to a server.
- Never include the wallet or bank name on the slip by default. It is personal information the other person doesn't need. It could be an optional toggle later.

### 3.9 Offline

If the phone is offline, the slip can still be built from the payments cached on the device. It shows "Some recent payments may not be synced yet" when there are unsynced entries. This is a later improvement, not v1.

### 3.10 Logo in the PDF

`expo-print` renders HTML, and the HTML can't load an app image by its file path. The logo has to be embedded as a small base64 image inside the HTML. Keep the embedded logo small (under about 30 KB) so PDFs stay light for WhatsApp.

### 3.11 Share message

When sharing, include a short text with the file, for example:

> Payment slip for Bike loan — PKR 30,000 paid, PKR 90,000 remaining.  
> Generated with WalletTrails: <Play Store link>

WhatsApp and Gmail show this text alongside the PDF. Some apps ignore the text and only send the file, so the link is **also printed in the PDF footer**.

### 3.12 Analytics

Track `slip_opened`, `slip_generated`, `slip_shared`, and `slip_prompt_accepted` / `slip_prompt_dismissed`. This shows whether the feature is used and how many shares go out. Use the existing `track()` helper, and send counts only, never amounts.

---

## 4. Phases

Each phase ends with tests and a short manual check before the next one starts. A phase is only "done" when its exit checklist passes.

### Phase 0 — Decisions (no code) — decided 19 November 2026

| Question | Decision |
| --- | --- |
| Who gets slips? (§3.7) | **Pro only**, the same as other PDF exports. Free and Plus users see the **Slip** button, but tapping it opens the upgrade sheet. The server also refuses the payment-history endpoint for non-Pro users once plan enforcement is live. |
| Closing a loan without full payment (§3.1) | **No way to close it.** A loan only completes when it is fully paid. Mark Complete is removed and not moved anywhere. Loans already closed by the old button keep their status, and their slips show the real remaining amount. |
| Lender / borrower name (§3.3) | **Later.** v1 uses the existing loan or plan name. |
| Play Store link | Set later in Ops → Ads & Config → `store_url`. No app update needed. |

**Exit:** done.

---

### Phase 1 — Backend: payment history for one loan or plan

**Build**

- A read-only endpoint per record type that returns everything a slip needs:
  - `GET /api/payables/<id>/payments/`
  - `GET /api/receivables/<id>/payments/`
  - `GET /api/projects/<id>/payments/` (one-time payments only)
- Each response contains: name, total amount, advance (projects only), status, list of payments (`date`, `amount`, `transaction_id`, oldest first), total paid or received, remaining amount, and the payment count.
- Only the owner can read their own records (same ownership rules as today).

**Tests (`backend/api/tests_payment_slips.py`)**

- Total − sum of payments = remaining, for all three record types.
- Installment plan: income linked through the project is included, the same as on the card.
- One-time payment: the advance shows as its own row.
- A loan closed with **Mark Complete** but not fully paid shows the real remaining amount.
- A deleted payment disappears from the list.
- Another user gets 404.

**Exit:** all tests pass; no change in the app yet.

---

### Phase 2 — The slip PDF template (no buttons yet)

**Build**

- `mobile/src/slips/` with:
  - `types.ts` — one `SlipData` shape used by every template (prepared by, counterparty, kind `owe` | `owed`, total, rows, total paid, remaining, slip number, generated at, store URL, highlighted payment id, closed / paid-in-full flags).
  - `templates/classic.ts` — the v1 design from §1.5, matching the green WalletTrails look of `reportPdf.ts`.
  - `templates/index.ts` — a small template registry (`{ id, label, render(data) → html }`) so Phase 8 only adds files.
  - `shareSlipPdf.ts` — creates the PDF with `expo-print`, names the file (for example `WalletTrails_Slip_Bike_loan_19-Nov-2026.pdf`), and opens the share sheet with the message from §3.11.
  - Embedded base64 logo (§3.10).
- Labels switch between "Payment" / "Payment received" and "Remaining" / "Remaining to receive" based on the kind.
- **PAID IN FULL** stamp when remaining is 0; "Closed without full payment" line when relevant.

**Tests**

- Unit tests on the HTML: names and amounts are escaped (a name like `<Ali & Sons>` doesn't break the PDF), rows are numbered 1..n, labels match the kind, and the stamp appears only when remaining is 0.
- Manual: generate sample slips with 0, 1, 12, and 40 payments. Check that long tables flow onto a second page cleanly, the header doesn't overlap, and the footer and logo appear.
- Manual: open the PDF in WhatsApp, Gmail, and Google Drive on a real phone.

**Exit:** sample PDFs reviewed and approved by you.

---

### Phase 3 — Slip button on "Money you owe" (loans)

**Build**

- On each loan card in `bills.tsx`:
  - Remove **Mark Complete** completely (Phase 0 decision).
  - Add **Slip** (also shown on completed loans, §3.2).
  - Free and Plus users: tapping **Slip** opens the upgrade sheet (Phase 0 decision).
- **Slip** opens a sheet with:
  - the payment history list (S.No, date, amount),
  - total paid and remaining,
  - an editable "Your name" field,
  - a **Generate & share PDF** button.
- Ask for PIN or fingerprint first if Hide amounts is on (§3.8).

**Tests**

- Manual on Android: loan with no payments ("No payments yet", PDF still works), loan partly paid, loan paid in full, loan marked complete by the old button.
- Manual: a Free account sees the upgrade sheet instead of the slip; a Pro account gets the PDF.
- Confirm the list and PDF numbers match the card exactly.
- Confirm **Mark Complete** is gone and nothing else on the card moved or broke (Record Payment, Edit, Mark Stuck, Delete).

**Exit:** manual checklist passes on a real device.

---

### Phase 4 — Slip button on "Owed to you"

**Build**

- Same **Slip** button and sheet on installment plans and one-time payments, using the "received" wording.
- One-time payment slips show the advance as the first row.

**Tests**

- Manual: plan with income linked through the project, one-time payment with an advance, completed plan.
- Numbers match the card for every case.

**Exit:** manual checklist passes.

---

### Phase 5 — "Generate a slip?" after recording a payment

**Build**

- After **Save payment** / **Save receipt** succeeds for a loan, plan, or one-time payment, show the prompt from §1.4.
- **Generate slip** opens the PDF with the new payment highlighted.
- Add a "Don't ask again" option, which can be turned back on in Settings.
- No prompt for monthly costs.

**Tests**

- Manual: the prompt appears only after a successful save, never after an error.
- The new payment is in the slip even right after saving (no stale data).
- Saving twice quickly doesn't create two payments or two prompts.

**Exit:** manual checklist passes.

---

### Phase 6 — Sharing polish and Play Store link

**Build**

- Read `store_url` from remote config at share time, with the fallback link (§2).
- Share text from §3.11.
- Analytics events from §3.12.

**Tests**

- Change `store_url` in Ops → **Ads & Config**, restart the app, and confirm new slips use the new link.
- Share to WhatsApp, Gmail, and Drive. Confirm the file name, the PDF, and the message.

**Exit:** release to internal testers; collect feedback through the tester Google Form.

---

### Phase 7 — Web app parity (optional)

Add the same **Slip** button on the web Bills page (`frontend/src/pages/Expenses.tsx`), reusing the Phase 1 endpoints and the same HTML template, printed through the browser ("Save as PDF").

---

### Phase 8 — More slip templates

- Add new files under `mobile/src/slips/templates/` (for example Minimal, Receipt-style, Urdu/bilingual).
- Add a template picker on the slip sheet; remember the last choice on the device.
- Slips are Pro only (Phase 0), so every template is part of Pro.

---

## 5. Summary

| Phase | What ships | Visible to users? |
| --- | --- | --- |
| 0 | Decisions | No |
| 1 | Backend payment history + tests | No |
| 2 | PDF template + share helper | No (sample PDFs only) |
| 3 | Slip on loans, Mark Complete removed | Yes |
| 4 | Slip on money owed to you | Yes |
| 5 | "Generate a slip?" prompt after paying | Yes |
| 6 | Play Store link, share text, analytics | Yes |
| 7 | Web app Slip button | Yes (web) |
| 8 | More templates | Yes |
