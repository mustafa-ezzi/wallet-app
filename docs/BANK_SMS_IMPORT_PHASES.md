# Bank SMS / Transaction Auto-Detect — Feature Spec & Phases

**Status:** Phase 0 complete · Phase 1 (paste MVP) implemented on web + mobile  
**Surfaces:** Mobile (paste) + Web (paste) — Android auto-SMS is Phase 3  
**Home currency:** PKR  
**Code:** `packages/bank-sms-parser` · Web `/bank-sms` · Mobile Settings → Bank SMS assist  

---

## 1. What we are building

CashTrail should optionally read **bank transaction SMS** (with explicit user permission), parse amount / type / bank hints, match a **wallet**, and queue a draft for the user to **Approve**, **Reject**, or **edit** (wallet, category, notes) — never silently create books without consent.

Think of it like OTP autofill apps: the system notices a relevant message, then asks the user to confirm the action.

### Core promise

| Promise | Detail |
|---------|--------|
| Permission first | No SMS access until the user opts in |
| Human in the loop | Every detected tx is a **pending suggestion**, not an auto-post |
| Wallet-aware | Prefer the bank wallet that matches the message (e.g. Meezan → Meezan wallet) |
| ATM-aware | Cash withdrawal becomes a **bank → cash** move, not a spend |
| Cross-platform review | Mobile captures; **web can review the same queue** once synced |

---

## 2. Message types (v1)

We support five transaction kinds derived from real Pakistani bank SMS patterns.

### 2.1 Real examples (from product)

| User type | Example SMS | CashTrail action on Approve |
|-----------|-------------|-----------------------------|
| **ATM** | `PKR 50,000.00 has been debited at 16:58 on 20-Aug-2026 TID:302750, If you have not done this…` | Treat as **cash withdrawal**: debit bank wallet, credit **Cash** wallet (transfer), not an expense |
| **Online / card expense** | `PKR 2,041.00 has been debited at 00:02 on 25-Aug-2026, If you have not done this…` | **Expense** on the matched bank wallet |
| **Bank sent (RAAST / transfer out)** | `PKR 230.00 sent to M.SHAKIR PK07TMFBxx161 as RAAST payment from your AC# xxx2554 of KHY E TANZEEM BRANCH on 22-Aug-2026 at 01:20 TID:633081.` | **Expense** (or later optional “transfer out / pay person”) on bank wallet |
| **Received** | `PKR 141,000.00 received from Z.UL AC# xxxPYMT PK07UNIL01090 as RAAST payment to your AC# 0108532554 of KHY E TANZEEM BRANCH on 25-Aug-2026 at 12:25` | **Income** on the matched bank wallet |
| **Reversed** | `PKR 3,147.00 is reversed into your A/C xxx2554 of KHY E TANZEEM BRANCH on 02-Aug-2026 at 02:38 TID:265023` | **Income** (or “refund / reversal” category) on bank wallet — money coming back |

### 2.2 How we tell ATM vs card expense (the hard catch)

Both ATM and many card spends say **“debited”**. Distinction must use **structure**, not amount.

| Signal | ATM (cash out) | Online / card spend |
|--------|----------------|---------------------|
| **TID** (terminal id) | Usually present (`TID:302750`) | Often **absent** (your card sample has no TID) |
| Keywords | `ATM`, `Cash Withdrawal`, `CWDR`, `WDL`, `POS` (careful — POS is card) | `Purchase`, `POS`, `e-commerce`, `online`, merchant name |
| Narrative | Debit + TID + no “sent to” counterparty | Debit + no TID / merchant / “purchase” |
| **Default rule (v1)** | If body matches debit **and** contains `TID` **and** does **not** look like RAAST/sent/received/reversed → classify as **ATM** | If body matches debit **and** has **no** `TID` (and not sent/received/reversed) → classify as **expense** |

**Important nuance:** Some bank “sent” messages also include `TID` (your RAAST sample). So order of classification matters:

1. **Reversed** (keyword `reversed`)  
2. **Received** (`received from` / `credited` / `deposited`)  
3. **Sent / RAAST out** (`sent to` / `RAAST payment from your`)  
4. **ATM** (`ATM` / `Cash Withdraw` / `(debited + TID)` and not matched above)  
5. **Expense** (`debited` / `purchase` / remaining debit)

User can always **override type** on the approval screen (ATM ↔ Expense ↔ Income).

### 2.3 Three user-facing buckets (UI)

Internally we store finer kinds; in the approval UI we show three main buckets + reversal:

| UI bucket | Internal kinds |
|-----------|----------------|
| **Expense** | Card / online debit, RAAST sent, other outbound |
| **ATM (cash out)** | ATM withdrawal → transfer to Cash |
| **Received** | Incoming RAAST / credit / deposit |
| **Reversed** (sub of Received or own chip) | Reversal into account |

---

## 3. End-to-end user flow

### 3.1 Permission

**New users (onboarding / start screens)**  
After account basics (or alongside notification permission), show a dedicated step:

> **Read bank SMS?**  
> CashTrail can detect bank alerts and draft expenses, ATM cash-outs, and money received. Messages stay on your device until you approve. You can change this anytime in Settings.  
> [Allow] [Not now]

**Existing users**  
On next app open (once per install, until answered): same sheet / modal. If dismissed → Settings toggle remains available. Never re-spam every launch; use:

- First open after feature ships → ask once  
- Settings → **Bank SMS import** (On / Off) + “Why we need this”  
- If OS permission revoked → show soft banner on Home, not a blocking wall

**Legal / trust copy**

- We do **not** upload full SMS bodies to servers by default in Phase 1 (prefer on-device parse).  
- If cloud assist is added later, strip PII and get a second opt-in.

### 3.2 Detection → pending queue

1. SMS arrives (or app scans recent inbox when opened, within a time window).  
2. Parser scores: is this a bank money message?  
3. Extract: amount, date/time, kind, bank/account hints, counterparty, TID, raw fingerprint.  
4. Deduplicate (same fingerprint / TID+amount+time).  
5. Create **PendingBankImport** (local + sync later).  
6. When user opens CashTrail → **Review detected transactions** sheet / inbox badge.

### 3.3 Approval UI (required)

For each pending item:

- Amount, date, parsed type chip (Expense / ATM / Received / Reversed)  
- Suggested wallet (editable dropdown of bank + cash)  
- Category (editable; defaults by type)  
- Notes (prefill counterparty / branch / TID)  
- Original SMS snippet (read-only)  
- Actions: **Approve** · **Reject** · **Skip for now**

Reject = ignore forever (fingerprint blacklisted).  
Skip = keep in queue.

### 3.4 ATM when user has no Cash wallet

Recommended product decision (v1):

| Situation | Behavior |
|-----------|----------|
| User has ≥1 `cash` wallet | ATM approve → **transfer** bank → preferred Cash (or last-used Cash); user can pick which Cash wallet |
| User has **no** cash wallet | Approval screen shows: **“Create Cash wallet & transfer”** (default) or **“Record as expense instead”** (escape hatch) |
| User declines create | Cannot Approve as ATM until they pick “expense instead” or create Cash |

**Do not** invent a silent cash wallet without showing it. Creating Cash on Approve is fine if the UI says so clearly:

> No Cash wallet yet. Approving will create **Cash** and move PKR 50,000 from Meezan → Cash.

Optional later: “Ask every time” vs “Always create Cash named X”.

### 3.5 Wallet matching

| Hint in SMS | Match strategy |
|-------------|----------------|
| Bank brand (“Meezan”, “HBL”, “UBL”, “JazzCash”, …) | Fuzzy match wallet **name** / user-set **SMS aliases** |
| Account mask (`AC# xxx2554`, `xxx2554`) | User maps last-4 / mask → wallet in Settings |
| Branch text | Weak signal only; do not override strong alias |
| No match | Prompt user to pick wallet; remember choice for that mask/brand |

Settings: **Wallet ↔ bank aliases**  
e.g. Wallet “Meezan Current” aliases: `Meezan`, `MEZN`, `xxx2554`.

---

## 4. Platform reality (mobile vs web)

| Platform | Can read SMS? | Role in this feature |
|----------|---------------|----------------------|
| **Android** | Yes (with `RECEIVE_SMS` / `READ_SMS` or notification-listener alternatives) | **Primary capture** |
| **iOS** | **No** general SMS read (Apple restriction) | Review queue only; optional Shortcuts / share-sheet / paste; never claim SMS read |
| **Web** | **No** SMS access | Review / approve / reject / edit pending items synced from mobile; optional **paste SMS** to create a draft |

So “mobile + web” means:

- **Capture:** Android-first; iOS/web use paste / share / sync  
- **Books:** Same API models; web UI for the approval inbox  
- Marketing copy must not say “CashTrail reads SMS on iPhone” — say “Android can auto-detect; on iOS/web paste or approve from phone”

### Alternative capture (accuracy + iOS/web)

1. **Paste SMS** on web and iOS → same parser  
2. **Share sheet** “Share to CashTrail” from Messages (iOS)  
3. Later: email bank alerts (forward rules) — Phase optional  
4. Later: bank statement CSV — separate feature  

---

## 5. Data model (proposed)

### `BankSmsImport` (server) / local mirror

| Field | Purpose |
|-------|---------|
| `id`, `user_id` | Ownership |
| `status` | `pending` / `approved` / `rejected` / `expired` |
| `kind` | `expense` / `atm` / `income` / `reversal` / `unknown` |
| `amount`, `occurred_at` | Parsed money + time |
| `suggested_account_id`, `resolved_account_id` | Wallet |
| `cash_account_id` | For ATM transfer target |
| `category`, `notes` | Editable |
| `fingerprint` | Hash for dedupe (normalized body + amount + date) |
| `tid` | Terminal / txn id when present |
| `counterparty` | e.g. `M.SHAKIR`, `Z.UL` |
| `bank_hint`, `account_mask` | Matching |
| `raw_snippet` | Short redacted snippet for UI (optional encrypt at rest) |
| `source` | `android_sms` / `paste` / `share` |
| `created_transaction_ids` | Links after approve |
| `parser_version`, `confidence` | Tuning |

### User prefs

- `sms_import_enabled`  
- `sms_permission_prompted_at`  
- `default_cash_wallet_id`  
- `wallet_aliases[]`  
- `auto_create_cash_on_atm` (bool, default true with confirm)

On Approve:

- **Expense / sent** → one expense tx on bank wallet  
- **Received / reversal** → one income tx on bank wallet  
- **ATM** → two legs or one transfer: bank −amount, cash +amount (same pattern as internal transfer if CashTrail already has transfer; otherwise expense+income pair with linked notes / `client_mutation_id` pair)

---

## 6. Parser rules (v1 starter)

Normalize: strip commas in amounts, unify spaces, uppercase for keyword checks.

| Pattern (illustrative) | Kind |
|------------------------|------|
| `PKR\s*([\d,]+\.?\d*)` | Amount |
| `\breversed\b` | `reversal` |
| `\breceived from\b` / `\bcredited\b` | `income` |
| `\bsent to\b` / `\bRAAST payment from your\b` | `expense` (outbound) |
| `\bATM\b` / `\bcash withdraw` / (`\bdebited\b` + `\bTID\s*:`) | `atm` |
| `\bdebited\b` (fallback) | `expense` |
| `TID:\s*(\w+)` | tid |
| `on\s+(\d{1,2}-\w{3}-\d{4})` + optional time | occurred_at |
| Bank dictionary | meezan, hbl, ubl, mcb, allied, jazzcash, easypaisa, … |

Confidence score example:

- Strong keyword match → 0.9  
- Debited+TID only → 0.75 (ATM)  
- Debited alone → 0.6 (expense)  
- Below 0.5 → still queue as `unknown`, force user to pick type  

---

## 7. Making it more accurate (beyond v1)

| Idea | Why it helps |
|------|----------------|
| **Per-bank templates** | Meezan vs HBL wording differs; templates beat one mega-regex |
| **User corrections feed** | When user flips ATM→Expense, store rule: “this bank + TID style = expense” only if they confirm “always” |
| **Account mask binding** | `xxx2554` → wallet permanently after first approve |
| **Merchant / RAAST name → category** | “sent to …” → Transfer / People suggest |
| **People link** | Outbound to a known person name → propose People lend/pay instead of plain expense |
| **Notification listener (Android)** | Some OEMs restrict SMS; reading bank **notifications** as fallback |
| **Duplicate defense** | Same TID within 48h ignored; same amount+minute soft-warn |
| **Balance line parse** (if SMS includes available balance) | Cross-check wallet drift; warn “books off by X” |
| **Quiet hours / batch review** | One “Review 4 bank alerts” screen instead of spam |
| **OCR of screenshot** | User shares SMS screenshot when paste fails |
| **Statement PDF/CSV import** | Month-end accuracy for heavy users |
| **Reversal linking** | Match reversal amount+TID window to prior expense and mark refund |
| **Multi-currency later** | Travel Mode: detect USD/AED SMS separately (out of PKR v1 scope) |
| **On-device ML classifier** | Small model over keyword rules once we have labeled corrections |
| **Bank allowlist** | Only parse senders in a known list (short codes) to cut false positives |

---

## 8. Privacy, security, compliance

- Explicit opt-in; Settings kill switch  
- Prefer **on-device parse**; sync only structured fields (+ short snippet if needed for web review)  
- Do not log full SMS in analytics  
- Fingerprints hashed  
- Play Store: declare SMS permission use (**financial SMS only**); expect scrutiny — prepare Privacy Policy section  
- iOS App Store: no SMS permission claim  
- Rejected imports deleted or anonymized after N days  

---

## 9. UX surfaces

| Surface | What |
|---------|------|
| Onboarding (new) | Permission step |
| First open (existing) | One-time prompt |
| Home badge | “3 bank alerts to review” |
| Review modal / screen | Approve / Reject / edit |
| Settings | Toggle, aliases, default Cash, paste tester |
| Web → Pending imports | Same queue via API |
| Web / iOS | “Paste bank SMS” box |

---

## 10. Edge cases

| Case | Handling |
|------|----------|
| Multiple bank wallets same brand | Ask once; remember by account mask |
| ATM but user wants it as expense | Type override on approve |
| Failed / declined card SMS | Parser ignore list: `failed`, `unsuccessful`, `OTP`, `do not share` |
| OTP / marketing SMS | Must **not** enter queue (high priority filter) |
| Offline approve | Queue locally; sync txs when online (reuse offline pipeline) |
| Partial parse (amount only) | Still show; force wallet + type |
| Reversal of ATM | Income to bank **or** reverse prior ATM transfer if linked |
| Joint accounts / family | Only the device user who opted in; no household auto-post in v1 |

---

## 11. Development phases

### Phase 0 — Spec & samples (this doc) ✅

- Freeze kinds, ATM vs expense rule, no-cash-wallet policy  
- Fixture pack: `packages/bank-sms-parser/src/fixtures.ts` (product samples + bank variants + ignore cases)  
- UX copy: `packages/bank-sms-parser/src/uxCopy.ts`  
- Privacy draft: `docs/BANK_SMS_PRIVACY.md`  

**Exit:** Fixture pack + approved UX copy for permission + approval sheet  

---

### Phase 1 — Parser + paste MVP (mobile + web) ✅

**No SMS permission yet** — users paste a message; we parse and open Approve flow.

- Shared parser: `@cashtrail/bank-sms-parser` (Vite + Expo aliases)  
- Fixtures + unit tests (`npm test` in `packages/bank-sms-parser` — 29 passing)  
- UI: Paste → preview → Approve creates real txs  
- ATM → Cash transfer (`Bank Transfer` double entry); prompt create Cash if missing  
- Settings entry: web Settings + mobile Settings → **Bank SMS assist**  

**Exit:** Paste works on Android, iOS, web; books correct for all 5 product samples  

---

### Phase 2 — Pending queue + sync API

- Backend models: `BankSmsImport`, prefs, aliases  
- CRUD: list pending, approve, reject  
- Mobile + web **Review inbox**  
- Dedup fingerprints  
- Link created transaction ids  

**Exit:** Paste on phone → appear on web pending list; approve from either side  

---

### Phase 3 — Android SMS permission & auto-detect

- Onboarding + existing-user prompt  
- Android SMS receive / read **or** notification listener (spike both; pick one for Play compliance)  
- Background → pending only (no silent approve)  
- Home badge + review sheet on open  
- Settings toggle + OS permission deep-link  

**Exit:** Real Meezan/HBL SMS appear as pending within seconds; approve posts books  

---

### Phase 4 — Wallet intelligence

- Alias settings + last-4 / mask mapping  
- Bank dictionary expansion  
- “Always use this wallet for xxx2554”  
- Confidence + unknown type UX  

**Exit:** ≥80% correct wallet suggestion on fixture banks without manual pick  

---

### Phase 5 — Accuracy & polish

- Per-bank templates  
- Correction learning (“always treat as…”)  
- Reversal ↔ original linking  
- OTP/marketing hard filters  
- Batch review UI  
- Optional People suggest for RAAST counterparties  

**Exit:** Low false-positive rate; documented Play Policy answers  

---

### Phase 6 — iOS / web capture upgrades (optional)

- iOS Share Sheet extension  
- Screenshot OCR  
- Email-forward ingest (ops-heavy; optional)  

**Exit:** Non-Android users can capture without typing amounts manually  

---

## 12. Suggested implementation order (practical)

1. Phase 1 paste MVP (ships value on **all** platforms, proves parser)  
2. Phase 2 sync inbox (web parity)  
3. Phase 3 Android auto SMS  
4. Phase 4–5 accuracy  

Do **not** start with SMS permission alone — Play review + false positives are harder than paste.

---

## 13. Acceptance criteria (feature done for v1)

- [ ] Permission asked for new users in start flow; existing users once on open; Settings can disable  
- [ ] Android can enqueue from SMS; web/iOS via paste (and review synced items)  
- [ ] ATM vs card expense distinguished using ordered rules (TID + keywords); user can override  
- [ ] Approve / Reject / change wallet required before books change  
- [ ] ATM with Cash wallet → transfer; without Cash → create Cash (confirmed) or record as expense  
- [ ] Received → income; Reversed → income/refund; Sent/RAAST → expense  
- [ ] OTP / failed / non-money SMS rarely enter queue  
- [ ] Dedupe by fingerprint / TID  
- [ ] Privacy Policy + in-app explanation  

---

## 14. Open decisions (confirm before Phase 3)

1. **SMS API vs Notification Listener** on Android (policy + OEM reliability)  
2. Store **raw snippet** on server for web review, or web-only after mobile approve? (Recommend: structured fields always; snippet optional + short TTL)  
3. ATM default Cash wallet: always “Cash” name vs last-used cash  
4. RAAST “sent to” → plain expense vs People flow when name matches  
5. Should **Reversed** reduce a prior expense category or always post as income?  

---

## 15. Summary

CashTrail gains a **permissioned bank-alert assistant**: detect or paste SMS → classify Expense / ATM / Received / Reversed → match wallet → user approves (editable) → write books. ATM moves money to Cash (create Cash if needed). Mobile (Android) captures; **web shares the review queue**. Accuracy grows via templates, aliases, and user corrections — never via silent autopost.
