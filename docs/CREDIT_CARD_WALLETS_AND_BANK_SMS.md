# Credit Card Wallets + Bank SMS Auto-Detection

**Audience:** You (product owner) — how to add credit cards to WalletTrails and make SMS import understand them  
**Current state:** Wallets are mainly `bank` + `cash` (+ `person` for lending). There is **no** dedicated `credit_card` type yet.  
**Related:** `docs/BANK_SMS_IMPORT_PHASES.md`, `packages/bank-sms-parser/`

---

## 1. What you want (in plain English)

1. Users can create a wallet that is a **credit card** (not only bank or cash).
2. When the bank / card issuer sends an SMS (“PKR 2,041 debited…”, “purchase on card ending 1234…”), auto-detect should:
   - Recognize it as a **card spend** (or payment / refund)
   - Match the correct **credit card wallet** (not the wrong current account)
   - Draft a transaction for Approve (same human-in-the-loop as today)

Credit cards are **not** the same as a debit bank account in bookkeeping. The design below exists so balances and SMS matching stay honest.

---

## 2. How credit cards differ from bank wallets

| Concept | Bank / cash wallet | Credit card wallet |
|---------|--------------------|--------------------|
| Balance meaning | Money you **have** | Money you **owe** (or available credit — product choice) |
| Typical SMS | Debit/credit on A/C | Purchase / POS / e-com on **card**; “payment received” toward outstanding |
| “What you have” total | Include | Usually **exclude** from “cash you own”; optionally show “card debt” separately |
| ATM | Bank → Cash transfer | Rare; some cards allow cash advance (fee) — treat carefully |
| Paying the card bill | Transfer **from bank → card** reduces debt | Not an “expense” twice |

### Recommended balance model (v1)

Store the card wallet balance as **outstanding debt** (what you owe):

- Opening: current statement outstanding (e.g. `45000` means you owe PKR 45,000).
- **Purchase SMS approved** → increase debt (expense against the card wallet, or “spend” that raises balance owed).
- **Payment SMS / manual “paid bill from Meezan”** → decrease debt (transfer from bank wallet → card wallet).
- **Refund / reversal** → decrease debt.

UI copy should say **“You owe”** for credit cards, not “Balance” like cash.

Alternative (later): track `credit_limit` + `available = limit − owed`. Nice-to-have; not required for SMS import.

---

## 3. Product shape — new wallet type

### 3.1 Data model (target)

Add account type:

```text
type: 'bank' | 'cash' | 'credit_card' | 'person'
```

Optional fields on credit card accounts (can be phase 2):

| Field | Why |
|-------|-----|
| `mask` / last 4 digits | Match SMS `card ending 1234` / `xx1234` |
| `issuer_hint` | `hbl`, `meezan`, `ubl`, `mcb`, etc. |
| `credit_limit` | Optional UI |
| `statement_day` / `due_day` | Reminders (you already have bills/reminders patterns) |

Today aliases for bank SMS live as hint + mask → `account_id` (`matchWallet.ts`). Credit cards should use the **same alias table**, but matching must also consider wallets with `type === 'credit_card'`.

### 3.2 UI changes (wallets screens)

- Create wallet: type picker → **Bank / Cash / Credit card**
- List: separate section **Credit cards** with “You owe …”
- Combined “What you have”: **bank + cash only** (same rule you already use for people wallets)
- Optional summary chip: **Card debt: PKR X**

### 3.3 Transactions

| User action | Books |
|-------------|--------|
| Spend on card (manual or SMS approve) | Expense on `credit_card` wallet → increases amount owed |
| Pay card from bank | **Transfer** bank → credit_card (reduces bank money + reduces card debt) |
| Cash advance (rare) | Card debt up + cash wallet up (transfer-like) + optional fee expense |
| Refund | Income / reversal on card → debt down |

**Do not** post a card purchase as an expense on the bank wallet if the SMS is clearly a **credit card** message — that double-counts when they later pay the bill.

---

## 4. Bank SMS today — what already exists

Pipeline (already built):

1. SMS / paste / notification → parser (`packages/bank-sms-parser`, mirrored under mobile/frontend)
2. Extract amount, kind (`expense` | `atm` | `income` | …), `bankHint`, `accountMask`
3. `suggestBankWallet()` — **only looks at `type === 'bank'`**
4. Pending draft → user Approves / Rejects

So card SMS that look like normal “debited” messages may already become **expense** drafts, but they will be matched to a **bank** wallet (or left unmatched) — wrong if the user has a separate credit card wallet.

---

## 5. How to teach auto-detect about credit cards

### 5.1 Detect “this SMS is about a card”

Extend parsing with a **instrument** flag (name can vary):

```text
instrument: 'account' | 'credit_card' | 'unknown'
```

**Strong card signals in Pakistani / regional SMS (examples):**

| Signal | Example patterns |
|--------|------------------|
| Explicit words | `credit card`, `crd`, `card ending`, `card xx`, `visa`, `mastercard`, `POS purchase` |
| Mask phrasing | `Card No. xx1234`, `ending with 1234` |
| Channel | `e-commerce`, `online purchase`, `intl purchase` (often card; still confirm) |
| Payment toward card | `payment received towards your credit card`, `thank you for payment` |

**Weak / shared with debit:** plain `PKR X has been debited` with no card keywords — keep as **account/debit** unless user alias forces a card wallet.

Classification order (add near existing kind order in `BANK_SMS_IMPORT_PHASES.md`):

1. Reversal / refund  
2. Card **payment received** (bill pay) → not a new purchase  
3. Received / RAAST in (usually bank account)  
4. Sent / RAAST out  
5. ATM / cash advance  
6. **Credit card purchase** (if instrument = credit_card)  
7. Generic expense debit  

### 5.2 Match the right credit card wallet

Extend matching (today: `suggestBankWallet` in `packages/bank-sms-parser/src/matchWallet.ts`):

1. If `instrument === 'credit_card'` (or strong card signals):
   - Search wallets with `type === 'credit_card'` first  
   - Priority: **alias mask (last 4)** → alias hint → name contains last 4 → single card wallet  
2. If no card wallet matches → ask user to pick / create card wallet on approve  
3. If SMS is ambiguous → show both bank and card wallets in the picker  

**Alias UX (important):**

When user Approves a card SMS onto “HBL Visa ****1234”:

- Save alias `{ account_id, mask: '1234', hint: 'hbl' }`  
- Next SMS with `ending 1234` auto-suggests that card  

Same `upsertWalletAlias` idea you already use for banks.

### 5.3 Approve-plan behavior

| Parsed case | Plan on Approve |
|-------------|-----------------|
| Card purchase | Expense on **credit_card** wallet (debt ↑) |
| Card payment received | Transfer **from bank → card** if bank known; else income/adjustment on card (debt ↓) — prefer transfer when user picks source bank |
| Card refund | Reversal / income on card (debt ↓) |
| Debit account SMS | Unchanged (bank / ATM / income) |

Always keep **human approve** — never silent post.

### 5.4 Concrete SMS examples (target behavior)

| SMS (simplified) | Detect | Match | On approve |
|------------------|--------|-------|------------|
| `Purchase of PKR 2,041 on your HBL Credit Card xx1234` | expense + credit_card | Card ****1234 | Expense on that card |
| `PKR 50,000 payment received on Credit Card xx1234` | card_payment | Card ****1234 | Transfer from chosen bank → card |
| `PKR 2,041.00 has been debited …` (no card words, A/C xxx2554) | expense + account | Bank ****2554 | Expense on bank (current behavior) |
| `ATM CWDR … TID:…` | atm | Bank | Bank → Cash transfer |

---

## 6. Implementation phases (recommended)

### Phase A — Wallet type only (manual)

- Add `credit_card` to API + mobile + web create/list  
- Balance labeled “You owe”  
- Exclude from “What you have”  
- Manual expenses + “pay bill” transfer  
- **No SMS changes yet** — users can still track cards by hand  

### Phase B — SMS instrument + match

- Parser: card keywords + last-4 extraction into `accountMask` / `instrument`  
- `matchWallet`: include `credit_card` wallets  
- Approval UI: suggest card wallets; remember aliases  
- Fixtures/tests in `packages/bank-sms-parser` with real anonymized SMS  

### Phase C — Card payments & statements

- Detect “payment towards credit card”  
- Optional statement due reminders  
- Credit limit / available credit UI  

Do **not** skip Phase A: SMS matching without a real card wallet type will keep posting onto bank accounts.

---

## 7. Edge cases to decide up front

| Edge case | Recommendation |
|-----------|----------------|
| User has HBL current **and** HBL credit card | Require **last-4 / alias**; never match on bank name alone when both exist |
| Same last-4 on debit and card (rare) | Prefer instrument keywords; else force manual pick |
| International / USD card SMS | Parse amount + currency; Travel Mode / FX later |
| Merchant installment SMS | Treat as purchase (debt ↑) unless user overrides |
| OTP-only SMS (`your OTP is`) | Ignore — not a money movement |
| Duplicate debit SMS + app push | Existing fingerprint / TID dedupe |

---

## 8. Checklist — “credit cards work end-to-end”

- [ ] User can create a **Credit card** wallet with optional last-4  
- [ ] Card debt excluded from “What you have”; shown separately  
- [ ] Manual card spend + pay-from-bank transfer work  
- [ ] Parser sets `instrument: credit_card` on card-like SMS  
- [ ] Matcher suggests credit card wallets (mask/hint)  
- [ ] Approve posts to card wallet, not bank  
- [ ] Card payment SMS reduces debt (transfer preferred)  
- [ ] Aliases remembered after first approve  
- [ ] Tests with sample HBL/Meezan/UBL-style card SMS  

---

## 9. Code touchpoints (when you implement)

| Area | Files / notes |
|------|----------------|
| Account type | Backend `Account` model + serializers; mobile/web wallet forms |
| Totals | Anywhere that filters `bank \|\| cash` for net worth |
| Parser | `packages/bank-sms-parser/src/parse.ts`, `templates.ts`, `types.ts` |
| Match | `packages/bank-sms-parser/src/matchWallet.ts` — today banks only |
| Approve plan | `approvePlan.ts` / bank SMS API — new steps for card payment |
| UI | `mobile/app/bank-sms.tsx`, web `BankSmsImport.tsx`, wallets tabs |
| Spec | Extend `docs/BANK_SMS_IMPORT_PHASES.md` with card kinds |

---

## 10. Short answer to “how do I tackle this?”

1. **Add a real `credit_card` wallet type** with “you owe” semantics and pay-bill transfers.  
2. **Teach the SMS parser** to spot card language + last-4.  
3. **Widen wallet matching** so suggestions include credit cards, not only `type === 'bank'`.  
4. **On approve**, post purchases to the card; post bill payments as bank → card transfers.  
5. **Remember aliases** so the next SMS auto-picks the right card.

That is the full path from “I want credit cards on wallets” to “automatic bank/card detection handles them too.”
