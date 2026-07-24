# Research: Household Combined / Shared Expenses

**Product:** CashTrail  
**Status:** Research / design proposal (not implemented) — development phases in §14  
**Date:** 2026-07-24  
**Goal:** Let multiple family members (each with their own CashTrail login) share one **household expense account/ledger**, so when anyone records a household expense, all members can see it, with monthly and event-based breakdowns, and the ability to close an event ledger with a final balance.

---

## 1. Problem statement

Today CashTrail is **single-user private**:

- Each user has their own wallets, transactions, bills, and reports.
- User A cannot see User B’s expenses.
- There is no “family pot” or shared ledger.

**Desired outcome (example):**


| Member     | Role                                                       |
| ---------- | ---------------------------------------------------------- |
| W, X, Y, Z | Four family members, each with their own CashTrail account |


They create (or join) one **Household shared expense account**.

- X buys groceries → logged against the household ledger → **W, X, Y, Z all see it**.
- Y pays electricity → same shared ledger → everyone sees it.
- At month end (or after an event like a wedding / trip), everyone sees a **complete expense breakdown** and totals.
- When recording a personal expense, the user can **link to bank** (balance drops) **and link to Household account** so that spend also appears on the shared ledger for all members.

**Two modes of household ledgers:**

1. **Ongoing / monthly** — “Home expenses” that never really end; reports by month forever.
2. **Event** — “Wedding”, “Umrah trip”, “Eid shopping”; open for a period, then **closed** with final total (and optionally locked to edits).

---

## 2. Current architecture (constraints)


| Area               | Today                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Tenancy            | Every model is `user = FK(User)`; APIs filter `request.user` only        |
| Wallet (`Account`) | Belongs to **one** user; balance = opening + income − expense            |
| Transaction        | Belongs to one user + one wallet; no payer / household / share fields    |
| Requirements doc   | Explicitly: multi-user = **isolated private spaces**, *not* team sharing |


So household sharing is a **new product layer** on top of private wallets — not a small tweak to `Account`.

---

## 3. Core product concepts

### 3.1 Separate “personal money” vs “household ledger”

Recommended mental model:


| Concept                                | What it is                                         | Who sees it    |
| -------------------------------------- | -------------------------------------------------- | -------------- |
| **Personal wallet** (existing)         | Meezan, JazzCash, cash in hand                     | Only the owner |
| **Household**                          | A *group* of members                               | All members    |
| **Household ledger** (shared account)  | Shared expense book for that household             | All members    |
| **Household transaction**              | A line in the shared book                          | All members    |
| **Funding / settlement** | Who paid expenses, who put money in the pot, who owes whom after Split equal | Members |


Important distinction:

- **Shared ledger visibility** ≠ automatically moving money between banks.
- **Decided product rule (locked):** When X spends money, **X’s personal wallet balance must drop**. Recording a household spend works like today’s expense form with **two links**:
  1. **Link to bank / wallet** (required for a real spend) → personal `Transaction` → X’s Meezan/JazzCash/cash balance falls.
  2. **Link to Household ledger** (optional) → same spend also appears on the shared household book for all members.

Example: X buys groceries for 5,000 → chooses Meezan + “Family home” ledger → Meezan −5,000 (only X sees wallets) and the household feed shows “Groceries 5,000 paid by X” (everyone sees).

### 3.2 Household ledger types


| Type      | Lifecycle                    | Reports                                              |
| --------- | ---------------------------- | ---------------------------------------------------- |
| `ongoing` | Open indefinitely; can pause | Monthly breakdown forever                            |
| `event`   | Open → active → **closed**   | Full event total; optional monthly slices while open |


Closing an **event** ledger should:

- Freeze new expenses (or require reopen).
- Show final: total spent, per-member contribution, per-category totals.
- Keep history read-only for all members.

---

## 4. Design options compared

### Option A — “Shared wallet” as a special `Account` with many owners

Extend `Account` with M2M members.


| Pros                           | Cons                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| Feels like “one account” in UI | Breaks today’s “one user owns one account” rule everywhere |
| Balance math already exists    | Whose opening balance? Who can delete?                     |
|                                | Personal wallet balance vs shared pot gets confusing       |


**Verdict:** Possible but invasive; easy to break existing wallet/PWA flows.

### Option B — New **Household** + **HouseholdLedger** entities (recommended)

Keep personal `Account`s untouched. Add:

- `Household` (family group)
- `HouseholdMembership` (user + role)
- `HouseholdLedger` (ongoing or event “shared expense account”)
- `HouseholdExpense` (shared line items)

Personal transactions can optionally **link** to a household expense.


| Pros                                  | Cons                            |
| ------------------------------------- | ------------------------------- |
| Clean separation from private wallets | New screens + APIs              |
| Matches “shared book” mental model    | Slightly more concepts to teach |
| Event close / monthly reports natural |                                 |
| Permissions are explicit              |                                 |


**Verdict:** Best fit for CashTrail’s current model and future multi-tenant product.

### Option C — Invite-only “view copy” of expenses (sync)

Each expense duplicated into every member’s private data.


| Pros             | Cons                             |
| ---------------- | -------------------------------- |
| No shared tables | Sync hell, edits/deletes diverge |
|                  | Totals disagree                  |


**Verdict:** Reject.

---

## 5. Recommended model (Option B)

### 5.1 Entities

```
User (existing)
  │
  ├── Account / Transaction (private — unchanged)
  │
  └── HouseholdMembership ──► Household
                                  │
                                  ├── HouseholdLedger  (ongoing | event)
                                  │       status: open | closed
                                  │
                                  └── HouseholdExpense
                                          amount, category, date, note
                                          created_by → User
                                          paid_by → User (who actually paid)
                                          optional: linked_personal_transaction → Transaction
                                          optional: linked_personal_account → Account
```

#### Household


| Field                    | Notes                                            |
| ------------------------ | ------------------------------------------------ |
| id                       |                                                  |
| name                     | e.g. “Khan Family”, “Flat 4B”                    |
| currency                 | Usually inherit creator’s currency               |
| created_by               | User                                             |
| invite_code / join token | See §9 — unique invite code + link (recommended) |
| created_at               |                                                  |


#### HouseholdMembership


| Field     | Notes     |
| --------- | --------- |
| household | FK        |
| user      | FK        |
| role      | `owner`   |
| status    | `invited` |
| joined_at |           |


#### HouseholdLedger (“shared expense account”)


| Field                 | Notes                                           |
| --------------------- | ----------------------------------------------- |
| household             | FK                                              |
| name                  | e.g. “Monthly home”, “Wedding 2026”             |
| kind                  | `ongoing`                                       |
| status                | `open`                                          |
| start_date            |                                                 |
| end_date              | Nullable; set when event closes                 |
| opening_float         | Optional cash float (if they keep cash at home) |
| notes                 |                                                 |
| closed_at / closed_by | When event ends                                 |
| closed_total_expense  | Snapshot at close (optional denormalized)       |


#### HouseholdExpense


| Field              | Notes                                     |
| ------------------ | ----------------------------------------- |
| ledger             | FK → HouseholdLedger                      |
| amount             |                                           |
| date               |                                           |
| category           | Groceries, Utilities, Travel, …           |
| notes              |                                           |
| created_by         | Who entered it                            |
| paid_by            | Who paid (default = created_by)           |
| linked_transaction | Optional FK → personal `Transaction`      |
| linked_account     | FK → personal wallet used to pay (decided: real spends always have this) |
| created_at         |                                           |


**Balance of a household ledger (v1):**

```
ledger_total_spent = SUM(household_expenses.amount) where ledger open/closed
# "balance" for event close = total spent (and optionally float − spent if they track a pot)
```

For ongoing monthly:

```
month_spent = SUM(expenses in that month)
breakdown by category, by paid_by member
```

---

## 6. How “link expense to household” works *(decided)*

**Primary flow — same as linking a bank today:**

When adding an expense (FAB / Add Transaction):

1. **Link to bank (wallet)** — choose Meezan / JazzCash / cash → **money leaves this wallet** (existing behavior; X’s balance drops).
2. **Link to Household account (ledger)** — optional select: “Also show on household” → pick ledger (“Monthly home” / “Wedding”).
3. System creates:
   - Personal `Transaction` (expense on the chosen wallet) — **always** when a wallet is selected.
   - `HouseholdExpense` linked to that transaction — **only if** a household ledger was selected — all members see it.

```
[ Add expense ]
   Amount: 5,000
   Category: Groceries
   Link to bank:        Meezan          ← balance drops for X
   Link to Household:   Family home     ← visible to W, X, Y, Z
```

Rules:

- **Spends that hit a wallet always reduce that member’s personal balance** — household link does not replace the bank link; it adds shared visibility.
- Other members see the household line and who paid; they **never** see X’s other private wallet activity.
- Editing/deleting a linked expense should update **both** sides (or require confirm before breaking the link).
- Closed event ledgers: reject new household links.
- **Household-only** (no personal wallet) is **not** the default path. Defer unless a later need appears (e.g. cash from a joint drawer with no personal wallet).

This matches: *“when spending, link to bank and link to Household account — bank balance drops, and if linked to Household it shows to the household.”*

---

## 7. Visibility & permissions


| Action                       | Owner | Admin | Member            |
| ---------------------------- | ----- | ----- | ----------------- |
| View all household expenses  | ✓     | ✓     | ✓                 |
| Add expense                  | ✓     | ✓     | ✓                 |
| Edit/delete own expense      | ✓     | ✓     | ✓                 |
| Edit/delete others’ expenses | ✓     | ✓     | ✗ (or admin only) |
| Invite / remove members      | ✓     | ✓     | ✗                 |
| Create ledger                | ✓     | ✓     | optional          |
| Close event ledger           | ✓     | ✓     | ✗                 |
| Delete household             | ✓     | ✗     | ✗                 |


**Privacy:** Members see household expenses only — never each other’s private wallets, income, loans, or unrelated personal transactions.

---

## 8. Reports & breakdowns

### 8.1 Per ledger — monthly

For ongoing (and open events):

- Total spent this month  
- By category (pie/list)  
- By member (`paid_by`) — “who paid how much”  
- Timeline / ledger table (date, particulars, paid by, amount)

### 8.2 Per ledger — event close

When closing:

1. Confirm no pending drafts.
2. Snapshot totals.
3. Set `status = closed`, `end_date = today`.
4. Show close summary screen:
  - Total spent  
  - Per member paid  
  - Optional **equal-split settlement** action: “Split equal among members → who owes whom” (see §13 / Phase 5 — product wants this option available)

### 8.3 Household home screen

- List of ledgers (open / closed)  
- This month’s combined household spend across ongoing ledgers  
- Recent shared expenses (feed)
- Badge / alert when another member posts an expense (**notifications — locked**, see §15)

---

## 9. How family members join (unique identifiers)

Members already have their own CashTrail logins. Joining a household must use something **unique, shareable, and hard to guess by accident** — without exposing private finances before they accept.

### 9.1 Options compared


| Method                                    | What the family shares                     | Uniqueness                                                | Pros                                                                       | Cons                                                                          | Fit for CashTrail               |
| ----------------------------------------- | ------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| **A. Household invite code**              | Short code e.g. `HOME-7K2Q` or `KHAN-9F3A` | Code unique globally (or until rotated)                   | Works offline/WhatsApp; no email infra; familiar (Discord/Splitwise-style) | Someone can leak the code                                                     | **Best for MVP**                |
| **B. Invite link + token**                | URL e.g. `cashtrail.app/join/a8f3…`        | Long random token unique                                  | One tap on phone; same security as code                                    | Needs deep link / PWA route                                                   | **Pair with A**                 |
| **C. Owner searches by username / email** | Owner types sibling’s email or username    | Email already unique in CashTrail; username = email today | Precise; no shared secret floating around                                  | Owner must know exact email; privacy (shows “user exists”); needs accept step | **Good as secondary**           |
| **D. QR code**                            | QR encoding invite link/code               | Same as B                                                 | Easy in person (dinner table)                                              | Needs camera UI                                                               | Nice-to-have later              |
| **E. Public household “slug” / handle**   | `@khan-family` forever                     | Slug unique                                               | Memorable                                                                  | Guessable; spam joins unless gated                                            | Only if + **approval required** |
| **F. Phone number**                       | Owner invites by phone                     | Needs verified phone field (you don’t have this)          | Common in PK apps                                                          | New verification infra                                                        | Not for v1                      |


**Do not use:** display name / first name alone — not unique.  
**Username today:** CashTrail sets `username = email` on register, so “invite by username” ≈ **invite by email**.

### 9.2 Recommended join system (v1)

Use **two complementary paths**:

#### Path 1 — Shareable invite code + link (primary)

When owner taps **Invite**:

1. Server creates / refreshes a unique **invite**:
  - `code` — human-friendly, unique, e.g. 6–8 chars: `7K2Q9M` or `HOME-7K2Q`
  - `token` — long random for URL: `/join?t=…`
  - `expires_at` — **LOCKED: 7 days** from creation/regeneration
  - `max_uses` — optional (e.g. 10) or unlimited until rotated/expired
2. Owner shares via WhatsApp:
  - Code: `Join our CashTrail household with code **HOME-7K2Q**`
  - Or link: `https://cashtrail…/join/HOME-7K2Q`
3. Other member (already logged in) opens **Household → Join** → enters code (or opens link) → sees **preview** (household name, member count — not private wallets) → taps **Accept**.
4. Membership becomes `active`; they see shared ledgers immediately.

**Uniqueness rules:**

- Invite `code` unique among **active (non-expired) invites** (or globally unique forever — simpler).
- Prefer **crockford base32 / no ambiguous chars** (`0/O`, `1/I`) so family can read it aloud.
- Owner can **Regenerate code** (old code dies; new code also gets a fresh 7-day expiry) if it leaks or expires.

#### Path 2 — Invite by email / username (secondary)

1. Owner enters family member’s **email** (unique in the system).
2. If that user **exists** → create `HouseholdMembership` with status `invited` → invitee sees **Pending invitations** → **Accept / Decline**.
3. If email is **not registered** → **LOCKED: invite to register**:
   - Store a pending email invite (`invited_email`, token, household).
   - Share a signup/join link; after they **sign up with that email**, they see preview → **Accept** (or pending invite on first login).
4. Never auto-join without Accept.

This is useful when you don’t want a code sitting in a family WhatsApp group forever, and when some relatives don’t have CashTrail yet.

### 9.3 Suggested data fields

```
HouseholdInvite
  household          FK
  code               CharField unique   # e.g. HOME-7K2Q
  token              CharField unique   # for URL
  created_by         FK User
  expires_at         DateTime           # LOCKED: created_at + 7 days (refresh on regenerate)
  max_uses           Int (nullable = unlimited)
  use_count          Int default 0
  revoked            Bool default False
  invited_email      EmailField null    # for invite-to-register path

HouseholdMembership
  … (as before)
  invited_via        enum: code | email | link
  invited_by         FK User (nullable)
```

Also keep a stable unique id on the household itself (`id` / UUID) for APIs — **never** ask users to type database ids; they use **code** or **email**.

### 9.4 Security & UX rules


| Rule                                                  | Why / decision                         |
| ----------------------------------------------------- | -------------------------------------- |
| Must be **logged in** to join (after signup if needed)| Household ties to their CashTrail user |
| Show household **name** (+ member count) before Accept | **LOCKED:** preview + Accept — never auto-join |
| Don’t reveal other members’ wallets on invite preview | Privacy                                |
| Rate-limit join attempts by code                      | Stop brute-forcing short codes         |
| Prefer 6+ character codes                             | Harder to guess than 4 digits          |
| One active membership per user per household          | No duplicates                          |
| Invite codes **expire in 7 days**                     | **LOCKED** — owner can regenerate      |
| No hard **max members** for now                       | **LOCKED** — revisit if abuse appears  |
| Invite by email can target **unregistered** emails    | **LOCKED:** invite to register         |


### 9.5 Example: four family members

1. Ali creates household **“Khan Family”** → gets code `KHAN-4F8R` + link.
2. Ali WhatsApps the code to Sara, Omar, and Ayesha.
3. Each opens CashTrail → Household → **Join with code** → enters `KHAN-4F8R` → **preview** → **Accept**.
4. Alternatively Ali taps **Invite by email** → `sara@…` (even if Sara has not signed up yet — invite to register) → Sara signs up if needed → accepts from pending list.
5. All four see the same shared expense ledger.

### 9.6 What we recommend shipping first


| Priority  | Mechanism                                                                 |
| --------- | ------------------------------------------------------------------------- |
| **P1**    | Unique **invite code** (7-day expiry) + join link + **preview + Accept** |
| **P1b**   | **Invite by email** + accept/decline; **invite to register** if no account |
| **P6**    | QR of the join link; in-app notifications when someone posts an expense  |
| **Later** | Optional public slug only with owner approval                             |


**Bottom line:** Use a **unique invite code** (shareable, WhatsApp-friendly) as the main join key; support **unique email** invites as a precise alternative. Both identify the household uniquely without relying on non-unique names.

---

## 10. Member onboarding flows

### Flow 1 — Create household

1. User creates household “Khan Family”.
2. Creates first ledger “Home monthly” (`ongoing`).
3. Invites others via **invite code / link** and/or **email** (see §9).

### Flow 2 — Join with code

1. Enter code (or open invite link) while logged in.
2. Preview household name → Accept.
3. Membership `active` → shared ledgers visible.

### Flow 3 — Join via email invite (including invite to register)

1. Owner invites by email.
2. If invitee already has an account → Household → Pending → preview → Accept.
3. If not registered → they sign up with that email (invite held) → then preview → Accept.
4. Same access as code join.

### Flow 4 — Existing four users

All four already registered → one creates household → three join with code or email (preview + Accept). Personal wallets stay separate; only the household ledger is shared.

### Flow 5 — Relative without CashTrail yet

Owner invites `uncle@…` → uncle receives / opens signup+join link → registers → Accept household preview → sees shared ledger.

---

## 11. UI sketch (CashTrail)


| Surface              | Change                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Entry point          | **LOCKED:** Prefer a **Household** item in bottom nav / sidebar if it fits without crowding; otherwise a **Household** button/card on the **Dashboard** that opens the same hub. Label: **Household**. |
| Household hub        | Households I’m in → **Invite** (code, 7-day expiry) / **Join with code** (preview + Accept) / pending invites → ledgers → feed |
| Create ledger        | Name, type (monthly / event), start date                                                            |
| Add shared expense   | Prefer dual-link from FAB: bank + household (see §6)                                                |
| FAB Add expense      | **Link to bank** + optional **Link to Household account**                                           |
| Reports              | Section: Household ledger report (month picker) + optional **Split equal**                          |
| Event close          | Dialog: “Close Wedding 2026? Total spent: …” then optional equal-split                              |
| Notifications        | **LOCKED:** notify other members when someone posts a household expense (in-app first; push later)  |


Keep personal **Wallets** page private; household is a separate space so users don’t confuse Meezan with “family book”.

---

## 12. API sketch (backend)

```
POST   /api/households/
GET    /api/households/
POST   /api/households/{id}/invites/         → { code, join_url, expires_at }
POST   /api/households/{id}/invites/revoke/
POST   /api/households/join/                 → { code } or { token }
POST   /api/households/{id}/invite-by-email/ → { email }
GET    /api/households/invitations/pending/  → list for current user
POST   /api/households/invitations/{id}/accept/
POST   /api/households/invitations/{id}/decline/

GET    /api/households/{id}/ledgers/
POST   /api/households/{id}/ledgers/
POST   /api/household-ledgers/{id}/close/

GET    /api/household-ledgers/{id}/expenses/?year=&month=
POST   /api/household-ledgers/{id}/expenses/
PATCH  /api/household-expenses/{id}/
DELETE /api/household-expenses/{id}/

GET    /api/household-ledgers/{id}/report/?year=&month=
```

Authorization: every endpoint checks active membership (not only `user=` owner).

Personal transaction create can accept:

```json
{
  "type": "expense",
  "amount": 5000,
  "account": 12,
  "category": "Groceries",
  "household_ledger": 3
}
```

→ creates personal tx + household expense in one request.

---

## 13. Contributions (family pot) + equal-split settlement *(locked)*

### 13.1 What “put money in the pot” means

**LOCKED (Q5):** Event/trip ledgers support **contributions** — a member puts money into the shared pot. That amount counts as **their credit** toward the trip (same idea as “I already paid my share”), alongside any expenses they personally paid.

Two kinds of lines on a household ledger:


| Line type            | Example                                      | Effect on that member’s **credit**      | Personal wallet                                      |
| -------------------- | -------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| **Contribution**     | Hussain puts 10,000 into Balochistan pot     | +10,000 credit for Hussain              | Link to Hussain’s bank → his balance drops 10,000    |
| **Expense**          | You pay hotel/fuel 25,000 from your Meezan   | +25,000 credit for you (you paid out)   | Link to your bank → your balance drops 25,000        |


**Credit** = money this member has already put toward the group (contributions + expenses they paid).  
**Fair share** = total group expenses ÷ number of members.  
**Net** = credit − fair share:

- **net > 0** → group owes them (they overpaid)  
- **net = 0** → settled — they pay nothing more  
- **net < 0** → they still owe that amount  

```
total_expenses = SUM(all expense lines on the ledger)
credit[m]      = SUM(expenses paid_by m) + SUM(contributions by m)
fair_share     = total_expenses / N
net[m]         = credit[m] - fair_share
```

Then simplify nets into “who pays whom” (optional **Split equal** button).

CashTrail does **not** move bank money — it only shows the suggestion.

### 13.2 Example — Balochistan trip

1. You create event ledger **“Balochistan trip”** and invite **Hussain** and **Idrees** (preview + Accept).
2. Three members: You, Hussain, Idrees (`N = 3`).
3. Hussain **puts 10,000 into the pot** (contribution, linked to his wallet) → Hussain credit = **+10,000**.
4. Trip expenses are logged (hotel, fuel, food, …). Suppose **total expenses = 30,000**, and **you paid 25,000** of those from your wallet → your credit = **+25,000**.  
   (Other 5,000 of expenses may be paid by Idrees or anyone else — whatever was logged.)
5. Tap **Split equal**:

| Member   | Credit (paid + pot) | Fair share (30,000 ÷ 3) | Net        | Meaning                                      |
| -------- | ------------------- | ----------------------- | ---------- | -------------------------------------------- |
| You      | 25,000              | 10,000                  | **+15,000** | Overpaid — others should settle **to you** |
| Hussain  | 10,000              | 10,000                  | **0**       | Settled — **Hussain pays nothing more**    |
| Idrees   | 0*                  | 10,000                  | **−10,000** | Still owes **10,000**                      |

\*If Idrees paid some of the remaining expenses, his credit rises and his owe shrinks.

**Why Hussain doesn’t pay more:** he already brought 10,000 to the pot, which equals one fair share of the 30,000 trip.

**Why you don’t “pay 7,500 more”:** you already paid 25,000 of expenses — you’re ahead. Settlement should show people **paying you**, not you paying again. (If a hand-calc suggested otherwise, use the table above as the source of truth.)

### 13.3 Data sketch

```
HouseholdContribution   (or HouseholdExpense with kind=contribution)
  ledger, amount, date, notes
  contributed_by → User
  linked_transaction → optional personal Transaction (bank link)
  linked_account     → optional personal wallet
```

Settlement UI (Phase 5): totals + credits + optional **Split equal** debt list.

### 13.4 When to build

- **P1–P4:** expenses + dual-link + event close + reports (contributions can wait one beat).  
- **P3 or P5:** add **Contribute to pot** on event ledgers + include contributions in Split equal math (recommended with **P5** so settlement is correct from day one of equal-split).

---

## 14. Development phases (build roadmap)

Ship household sharing in **ordered phases**. Each phase must be **demoable and usable on its own** before starting the next. Do not skip ahead (e.g. settlements before shared expenses exist).

```
P0 Research ──► P1 Foundation + MVP ──► P2 Dual link (bank + Household) ──► P3 Events
                                                                              │
                                                                              ▼
                                                            P4 Reports ──► P5 Settlements ──► P6 Polish
```

**Rules across all phases**

- Personal wallets, income, loans, and private transactions stay private.
- Every household API checks **active membership** (never only `created_by`).
- Prefer CashTrail UI patterns already in the app (confirm dialogs, glass cards, FAB).
- Add/adjust backend scenario tests per phase before calling the phase done.

---

### Phase 0 — Research & schema lock *(current)*


|            |                                                           |
| ---------- | --------------------------------------------------------- |
| **Goal**   | Agree the product model before writing production code    |
| **Status** | ✅ Complete — schema locked (§19), requirements updated   |
| **Effort** | Done when product owner signs off on open questions (§17) |


**Deliverables**

- [x] Problem, Option B model, join strategy (invite code + email)
- [x] Most §17 questions answered — including pot contributions + Split equal (§13)
- [x] Final field list for migrations — see **§19 Schema lock (P0)**
- [x] Update `My-Wallet requirments.md`: household sharing as an intentional exception to pure isolation

**Exit criteria:** Model + join method approved; no blocking open questions for P1. ✅

---

### Phase 1 — Foundation + MVP shared ledger


|                |                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Goal**       | Four logged-in family members can share **one ongoing expense book** and all see the same lines |
| **Effort**     | ~1–1.5 weeks                                                                                    |
| **Depends on** | P0                                                                                              |


**Backend**

- [x] Models + migrations: `Household`, `HouseholdMembership`, `HouseholdInvite`, `HouseholdLedger`, `HouseholdExpense` (`0006`)
- [x] Permissions: owner / admin / member; active membership required
- [x] APIs: create/list households; create invite (code + join URL); join by code; invite by email; accept/decline pending; create one `ongoing` ledger; expenses CRUD; month filter
- [x] Unique invite codes; regenerate/revoke invite (7-day expiry)
- [x] Scenario tests: create → invite → join → add expense → other member sees it

**Frontend**

- [x] **Household** entry: sidebar + Dashboard card (bottom nav kept at 5)
- [x] Hub: my households, create household, join with code (**preview + Accept**), pending invites (including invite-to-register)
- [x] Invite screen: show code + copy + regenerate; note **expires in 7 days**
- [x] Ledger detail: expense feed, add expense, month total
- [x] No hard member cap

**Out of scope for P1:** linking to personal wallet (P2), event close (P3), equal-split (P5), rich charts, push — but **design invite + Accept UX** now.

**Exit criteria (demo):** ✅ Covered by `HouseholdPhase1ScenarioTests` + Household UI.

**Exit criteria (demo):**

1. User A creates “Khan Family” + ledger “Home monthly”.
2. Users B/C/D join with code (or email accept).
3. B adds groceries → A, C, D see it without refresh issues (or after soft reload).
4. Month total matches the sum of shared lines.
5. Non-members cannot open the household API/UI.

---

### Phase 2 — Dual link: bank + Household *(core spend UX)*


|                |                                                                          |
| -------------- | ------------------------------------------------------------------------ |
| **Goal**       | Add expense form mirrors bank linking: **link to bank** (balance drops) **and link to Household** (family sees it) |
| **Effort**     | ~3–5 days                                                                |
| **Depends on** | P1                                                                       |


**Backend**

- [x] `Transaction` create accepts optional `household_ledger` → creates personal expense + linked `HouseholdExpense`
- [x] Edit/delete linked pair (tx update syncs household line; delete removes both sides when safe)
- [x] Household hub add with `linked_account` also creates personal wallet expense
- [x] Do **not** prioritize household-only as default — wallet link recommended in UI

**Frontend**

- [x] FAB / Add Transaction: **Link to bank** + optional **Link to Household**
- [x] Household feed: “Paid from [wallet]” badge when dual-linked
- [x] Clear copy: linking household does not move money between members’ banks

**Exit criteria:** ✅ `HouseholdPhase2DualLinkTests` — Meezan −5,000 + shared line visible to other member; without link stays personal-only.

---

### Phase 3 — Event ledgers (open → close)


|                |                                                        |
| -------------- | ------------------------------------------------------ |
| **Goal**       | Wedding / trip / Eid ledgers with a final locked total |
| **Effort**     | ~3–5 days                                              |
| **Depends on** | P1 (P2 nice-to-have but not required)                  |


**Backend**

- [x] Ledger `kind`: `ongoing` | `event`; `status`: `open` | `closed`
- [x] `POST …/close/` → snapshot totals, set `end_date` / `closed_by`; reject new expenses
- [x] Owner/admin reopen with confirm (optional but recommended)

**Frontend**

- [x] Create ledger: choose Monthly vs Event
- [x] Close event dialog: “Total spent: … Close & lock?”
- [x] Closed ledger UI: read-only feed + final summary (total, by member, by category — can be simple lists)
- [x] Clear open vs closed badges on hub

**Exit criteria:** Event can be filled by all members, closed once, history remains visible, new adds blocked until reopen. ✅

---

### Phase 4 — Household reports & breakdown


|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Goal**       | “Complete expense breakdown” for month and for closed events |
| **Effort**     | ~3–5 days                                                    |
| **Depends on** | P1 + P3 for event reports                                    |


**Backend**

- [ ] `GET …/report/?year=&month=` → totals, by category, by `paid_by`, daily/timeline rows
- [ ] Closed-event report uses snapshot + live history consistency checks

**Frontend**

- [ ] Household report screen (or Reports tab section): month picker, category list, who-paid list, ledger table
- [ ] Optional CSV/PDF export (reuse CashTrail export patterns if already solid)

**Exit criteria:** Family can answer “how much this month?”, “who paid most?”, “what on groceries?” without leaving the app.

---

### Phase 5 — Pot contributions + Split equal


|                |                                                                 |
| -------------- | --------------------------------------------------------------- |
| **Goal**       | “Put money in the pot” + optional **Split equal** using credits |
| **Effort**     | ~4–6 days                                                       |
| **Depends on** | P3 + P4                                                         |


**Backend**

- [ ] `HouseholdContribution` (or expense `kind=contribution`): amount, contributed_by, optional linked personal tx/wallet
- [ ] Settlement: `credit = paid_expenses + contributions`, `fair_share = total_expenses / N`, `net = credit − fair_share`, simplify debts
- [ ] Optional: mark settlement pairs “settled” (notes only — no bank move)

**Frontend**

- [ ] Event ledger: **Contribute to pot** (pick my wallet + amount) — same dual-link idea as expenses
- [ ] Show each member’s credit (paid + pot) on report / close screen
- [ ] **Split equal** button → who owes whom (optional)
- [ ] Disclaimer: suggestions only — CashTrail does not move bank money

**Exit criteria:** Balochistan-style demo: Hussain contributes 10k, you pay 25k of 30k total expenses, 3 members → Hussain net 0, you owed, Idrees owes (see §13).

---

### Phase 6 — Polish & engagement


|                |                                        |
| -------------- | -------------------------------------- |
| **Goal**       | Sticky, safe, everyday use             |
| **Effort**     | ~1 week (can ship items independently) |
| **Depends on** | P1+                                    |


**Ship as small slices**

- [ ] Roles UX: promote/demote admin; leave household; soft-remove member (keep history)
- [ ] **Notifications (LOCKED):** in-app badge/alert when a member posts a household expense; push later if infra exists
- [ ] QR code for invite link
- [ ] Empty states, tour tip, confirm dialogs for destructive household actions
- [ ] Performance: paginate expense feed; indexes on `(ledger, date)`
- [ ] PWA: household screens work offline-read where feasible (optional)
- [ ] Finalize nav vs Dashboard button after trying fit on mobile bottom nav

**Exit criteria:** Owner can manage members safely; members get a clear signal when the book changes; no privacy leaks in invite preview.

---

### Phase summary (at a glance)


| Phase  | Name                   | Ships                                                                      | Rough effort |
| ------ | ---------------------- | -------------------------------------------------------------------------- | ------------ |
| **P0** | Research & schema lock | Agreed model + requirements update                                         | Sign-off     |
| **P1** | Foundation + MVP       | Household, invite code/email, ongoing ledger, shared expenses, month total | 1–1.5 wk     |
| **P2** | Dual link (bank + Household) | FAB: link to bank (balance drops) + link to Household (family sees) | 3–5 d        |
| **P3** | Event ledgers          | Event create + close + read-only history                                   | 3–5 d        |
| **P4** | Reports                | Category / member / timeline breakdown (+ optional export)                 | 3–5 d        |
| **P5** | Pot + Split equal | Contributions to pot + credit-based equal split (Balochistan-style) | 4–6 d |
| **P6** | Polish | Notifications, roles, QR, nav-or-dashboard entry polish | ~1 wk |


**Suggested ship order for first real users:** **P1 → P2 → P3 → P4 → P5 (Split equal) → P6 (notifications)**.

**Total to “useful family product” (P1–P4):** roughly **3–4 weeks** depending on polish and mobile UX.

---

## 15. Risks & decisions to lock early


| Topic                                      | Decision |
| ------------------------------------------ | -------- |
| Shared expense vs personal wallet          | **LOCKED:** Link to bank (balance drops) + optional link to Household (family sees). |
| Equal-split settlement                     | **LOCKED:** Offer optional **Split equal** (Phase 5) — not forced. |
| Max members per household                  | **LOCKED:** No max for now. |
| Where Household lives in UI                | **LOCKED:** Prefer nav item if it fits; else Dashboard button. Label **Household**. |
| Family pot / contributions                 | **LOCKED:** Yes — members can **put money in the pot**; that counts as **credit** in equal-split, same as expenses they paid (see §13 Balochistan example). |
| Notifications on new household expense     | **LOCKED:** Yes (in-app; push later). |
| Invite code expiry                         | **LOCKED:** **7 days**; owner can regenerate. |
| Join UX                                    | **LOCKED:** Preview + **Accept** — never auto-join. |
| Invite unregistered emails                 | **LOCKED:** **Invite to register** (hold invite until signup + Accept). |
| Can non-payers edit others’ lines?         | **No** — only own, unless admin |
| Closed event reopen?                       | Owner/admin only, with confirm |
| Multiple households per user?              | **Yes** |
| Currency mix                               | One currency per household |
| Delete member with history                 | Soft-leave; keep past `paid_by` name |
| Requirements doc                           | Update: household sharing as exception to pure isolation |

---

## 16. How this maps to your example

> 4 family members, each with CashTrail accounts, share one household expense account.

1. One member creates **Household** + ledger **“Family home”** (`ongoing`) and gets unique code `KHAN-4F8R` (expires in 7 days).
2. Other three join via that code → **preview → Accept** (or email invite / invite-to-register) — see §9.
3. X adds expense 2,000 groceries → **link to bank** (X’s Meezan) **and link to Household** (“Family home”) → Meezan balance drops; Y, Z, W get a **notification** and see the line on the household ledger.
4. Y, Z, W open Household → see X’s line (they do not see X’s other private wallet activity).
5. Month report: total, by category, by who paid; optional **Split equal**.
6. For a wedding / trip: create event ledger → members **contribute to pot** and/or pay expenses (bank + household link) → **Close** → optional **Split equal** using credits (see §13 Balochistan example).

---

## 17. Product decisions (Q&A)

### Locked answers

1. **Personal wallet on household spend?**  
   **Yes.** Link to bank (balance drops) + optional link to Household (family sees). See §6.

2. **Equal split?**  
   **Yes — as an option.** Show totals always; offer **Split equal** for who-owes-whom (Phase 5).

3. **Max members?**  
   **No max for now.**

4. **Nav placement?**  
   Prefer **Household** in bottom nav / sidebar if it fits without crowding; otherwise a **Household** button/card on the **Dashboard**.

5. **Family pot / contributions?**  
   **Yes — locked.** Members can contribute cash to the event pot (linked to their bank so their balance drops). Contribution = **credit** toward the trip. On **Split equal**,  
   `credit = expenses they paid + pot contributions`, `fair_share = total_expenses / N`, `net = credit − fair_share`.  
   Example: Balochistan trip, total expenses 30,000, 3 people → fair share 10,000. Hussain puts 10k in pot → net 0 (pays nothing more). You paid 25k of expenses → net +15,000 (others settle to you). See **§13**.

6. **Notifications when someone posts?**  
   **Yes.** In-app first; push later if available (Phase 6).

7. **Invite code expiry?**  
   **7 days.** Owner can regenerate (new 7-day window).

8. **Join by code?**  
   **Preview + Accept** — never auto-join on enter.

9. **Invite emails without an account?**  
   **Yes — invite to register.** Hold the invite; after signup with that email → preview → Accept.

---

## 18. Recommendation (summary)

Build a **Household + HouseholdLedger + HouseholdExpense** layer beside personal wallets (Option B).

- Do **not** overload personal `Account` as multi-owner.
- Support **ongoing monthly** and **event** ledgers with close.
- Spends use **dual link:** bank (balance drops) + optional Household (family sees).
- Events support **pot contributions** (also bank-linked); contributions + paid expenses both count as **credit** for optional **Split equal**.
- Join: **invite code (7-day expiry) + link**, **preview + Accept**; email invites including **invite to register**.
- **Notify** members on new shared expenses; entry via **nav or Dashboard**.
- Follow **§14 phases:** P0 → P1 → P2 dual-link → P3 events → P4 reports → **P5 contributions + Split equal** → P6 polish/notifications.

This stays compatible with CashTrail’s private multi-tenant design while adding intentional, permissioned family sharing.

---

## 19. Schema lock (Phase 0) — final fields for migration `0006`

Django app: `api`. All money fields: `DecimalField(max_digits=14, decimal_places=2)`.

### Household
| Field | Type | Notes |
| ----- | ---- | ----- |
| id | PK | |
| name | CharField(120) | |
| currency | CharField(10) default PKR | from creator profile |
| created_by | FK User SET_NULL | |
| created_at | DateTime auto | |

### HouseholdMembership
| Field | Type | Notes |
| ----- | ---- | ----- |
| household | FK Household CASCADE | |
| user | FK User CASCADE null | null until invite-to-register accepts |
| role | CharField | `owner` \| `admin` \| `member` |
| status | CharField | `invited` \| `active` \| `left` \| `declined` |
| invited_via | CharField | `code` \| `email` \| `link` \| `create` |
| invited_by | FK User SET_NULL null | |
| invited_email | EmailField blank | for invite-to-register |
| joined_at | DateTime null | set when active |
| created_at | DateTime auto | |
| unique | (household, user) when user set | also unique pending (household, invited_email) |

### HouseholdInvite
| Field | Type | Notes |
| ----- | ---- | ----- |
| household | FK CASCADE | |
| code | CharField(16) unique | e.g. `HOME-7K2Q` |
| token | CharField(64) unique | URL token |
| created_by | FK User | |
| expires_at | DateTime | created + 7 days |
| max_uses | Int null | unlimited if null |
| use_count | Int default 0 | |
| revoked | Bool default False | |
| created_at | DateTime auto | |

### HouseholdLedger
| Field | Type | Notes |
| ----- | ---- | ----- |
| household | FK CASCADE | |
| name | CharField(150) | |
| kind | CharField | `ongoing` \| `event` (P1 uses ongoing) |
| status | CharField | `open` \| `closed` |
| start_date | Date | |
| end_date | Date null | |
| opening_float | Decimal default 0 | |
| notes | Text blank | |
| closed_at | DateTime null | |
| closed_by | FK User SET_NULL null | |
| closed_total_expense | Decimal null | snapshot |
| created_at | DateTime auto | |

### HouseholdExpense (P1)
| Field | Type | Notes |
| ----- | ---- | ----- |
| ledger | FK CASCADE | |
| amount | Decimal | |
| date | Date | |
| category | CharField(100) blank | |
| notes | Text blank | |
| created_by | FK User | |
| paid_by | FK User | default created_by |
| linked_transaction | FK Transaction SET_NULL null | P2 |
| linked_account | FK Account SET_NULL null | optional in P1 hub; required path in P2 FAB |
| created_at | DateTime auto | |

**P1 does not ship** `HouseholdContribution` (Phase 5) or ledger close APIs (Phase 3) beyond model fields for `kind`/`status`.

---
