# Research: Household Combined / Shared Expenses

**Product:** CashTrail  
**Status:** Research / design proposal (not implemented)  
**Date:** 2026-07-23  
**Goal:** Let multiple family members (each with their own CashTrail login) share one **household expense account/ledger**, so when anyone records a household expense, all members can see it, with monthly and event-based breakdowns, and the ability to close an event ledger with a final balance.

---

## 1. Problem statement

Today CashTrail is **single-user private**:

- Each user has their own wallets, transactions, bills, and reports.
- User A cannot see User B’s expenses.
- There is no “family pot” or shared ledger.

**Desired outcome (example):**

| Member | Role |
|--------|------|
| W, X, Y, Z | Four family members, each with their own CashTrail account |

They create (or join) one **Household shared expense account**.

- X buys groceries → logged against the household ledger → **W, X, Y, Z all see it**.
- Y pays electricity → same shared ledger → everyone sees it.
- At month end (or after an event like a wedding / trip), everyone sees a **complete expense breakdown** and totals.
- Optionally, when recording a personal expense, the user can **link it to the household shared account** so that specific spend counts in the shared ledger (not only in their private wallet).

**Two modes of household ledgers:**

1. **Ongoing / monthly** — “Home expenses” that never really end; reports by month forever.
2. **Event** — “Wedding”, “Umrah trip”, “Eid shopping”; open for a period, then **closed** with final total (and optionally locked to edits).

---

## 2. Current architecture (constraints)

| Area | Today |
|------|--------|
| Tenancy | Every model is `user = FK(User)`; APIs filter `request.user` only |
| Wallet (`Account`) | Belongs to **one** user; balance = opening + income − expense |
| Transaction | Belongs to one user + one wallet; no payer / household / share fields |
| Requirements doc | Explicitly: multi-user = **isolated private spaces**, *not* team sharing |

So household sharing is a **new product layer** on top of private wallets — not a small tweak to `Account`.

---

## 3. Core product concepts

### 3.1 Separate “personal money” vs “household ledger”

Recommended mental model:

| Concept | What it is | Who sees it |
|---------|------------|-------------|
| **Personal wallet** (existing) | Meezan, JazzCash, cash in hand | Only the owner |
| **Household** | A *group* of members | All members |
| **Household ledger** (shared account) | Shared expense book for that household | All members |
| **Household transaction** | A line in the shared book | All members |
| **Funding / settlement** (optional v2) | Who paid from which personal wallet, who owes whom | Members |

Important distinction:

- **Shared ledger visibility** ≠ automatically moving money between banks.
- Recording “X spent 5,000 on groceries for the house” can mean:
  - **A)** Only a shared bookkeeping entry (recommended for v1), and/or  
  - **B)** Also a personal wallet expense on X’s Meezan (so X’s personal balance drops).

Most families want **both**: shared visibility + correct personal balance for the person who paid.

### 3.2 Household ledger types

| Type | Lifecycle | Reports |
|------|-----------|---------|
| `ongoing` | Open indefinitely; can pause | Monthly breakdown forever |
| `event` | Open → active → **closed** | Full event total; optional monthly slices while open |

Closing an **event** ledger should:

- Freeze new expenses (or require reopen).
- Show final: total spent, per-member contribution, per-category totals.
- Keep history read-only for all members.

---

## 4. Design options compared

### Option A — “Shared wallet” as a special `Account` with many owners

Extend `Account` with M2M members.

| Pros | Cons |
|------|------|
| Feels like “one account” in UI | Breaks today’s “one user owns one account” rule everywhere |
| Balance math already exists | Whose opening balance? Who can delete? |
| | Personal wallet balance vs shared pot gets confusing |

**Verdict:** Possible but invasive; easy to break existing wallet/PWA flows.

### Option B — New **Household** + **HouseholdLedger** entities (recommended)

Keep personal `Account`s untouched. Add:

- `Household` (family group)
- `HouseholdMembership` (user + role)
- `HouseholdLedger` (ongoing or event “shared expense account”)
- `HouseholdExpense` (shared line items)

Personal transactions can optionally **link** to a household expense.

| Pros | Cons |
|------|------|
| Clean separation from private wallets | New screens + APIs |
| Matches “shared book” mental model | Slightly more concepts to teach |
| Event close / monthly reports natural | |
| Permissions are explicit | |

**Verdict:** Best fit for CashTrail’s current model and future multi-tenant product.

### Option C — Invite-only “view copy” of expenses (sync)

Each expense duplicated into every member’s private data.

| Pros | Cons |
|------|------|
| No shared tables | Sync hell, edits/deletes diverge |
| | Totals disagree |

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

| Field | Notes |
|-------|--------|
| id | |
| name | e.g. “Khan Family”, “Flat 4B” |
| currency | Usually inherit creator’s currency |
| created_by | User |
| invite_code / join token | Optional simple join |
| created_at | |

#### HouseholdMembership

| Field | Notes |
|-------|--------|
| household | FK |
| user | FK |
| role | `owner` \| `admin` \| `member` |
| status | `invited` \| `active` \| `left` |
| joined_at | |

#### HouseholdLedger (“shared expense account”)

| Field | Notes |
|-------|--------|
| household | FK |
| name | e.g. “Monthly home”, “Wedding 2026” |
| kind | `ongoing` \| `event` |
| status | `open` \| `closed` |
| start_date | |
| end_date | Nullable; set when event closes |
| opening_float | Optional cash float (if they keep cash at home) |
| notes | |
| closed_at / closed_by | When event ends |
| closed_total_expense | Snapshot at close (optional denormalized) |

#### HouseholdExpense

| Field | Notes |
|-------|--------|
| ledger | FK → HouseholdLedger |
| amount | |
| date | |
| category | Groceries, Utilities, Travel, … |
| notes | |
| created_by | Who entered it |
| paid_by | Who paid (default = created_by) |
| linked_transaction | Optional FK → personal `Transaction` |
| linked_account | Optional FK → personal wallet used to pay |
| created_at | |

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

## 6. How “link expense to household” works

User flow when adding an expense (FAB or Bills):

1. Choose personal wallet (Meezan) — **money leaves this wallet** (existing behavior).
2. Toggle / select: **Also add to household ledger** → pick ledger (“Monthly home” / “Wedding”).
3. System creates:
   - Personal `Transaction` (expense on Meezan) — keeps personal balance correct.
   - `HouseholdExpense` linked to that transaction — all members see it on the shared ledger.

Rules:

- If user only wants shared bookkeeping (cash from a joint drawer, no personal wallet hit), allow **household-only** entry (no personal transaction).
- Editing/deleting should update both sides when linked (or block delete of one side without confirmation).
- Closed event ledgers: reject new links.

This matches the request: *“link the expense with the household expense account so that specifically that expense will go to the household shared account.”*

---

## 7. Visibility & permissions

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View all household expenses | ✓ | ✓ | ✓ |
| Add expense | ✓ | ✓ | ✓ |
| Edit/delete own expense | ✓ | ✓ | ✓ |
| Edit/delete others’ expenses | ✓ | ✓ | ✗ (or admin only) |
| Invite / remove members | ✓ | ✓ | ✗ |
| Create ledger | ✓ | ✓ | optional |
| Close event ledger | ✓ | ✓ | ✗ |
| Delete household | ✓ | ✗ | ✗ |

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
   - Optional settlement hint: “X paid 40k, Y paid 10k → if equal split 4 ways, Y owes X …” (**settlement math can be v2**)

### 8.3 Household home screen

- List of ledgers (open / closed)  
- This month’s combined household spend across ongoing ledgers  
- Recent shared expenses (feed)

---

## 9. Member onboarding flows

### Flow 1 — Create household

1. User creates household “Khan Family”.
2. Creates first ledger “Home monthly” (`ongoing`).
3. Invites others via:
   - **Invite link / code** (simplest), or  
   - Email invite (needs email infra).

### Flow 2 — Join

1. Enter code / open link.
2. Accept → `HouseholdMembership` active.
3. Immediately see shared ledgers + expenses.

### Flow 3 — Existing four users

All four already registered → one creates household → three join with code. No need to merge personal wallets.

---

## 10. UI sketch (CashTrail)

| Surface | Change |
|---------|--------|
| Bottom nav / sidebar | New tab: **Household** (or under Wallets as “Shared”) |
| Household hub | Households I’m in → ledgers → expense feed |
| Create ledger | Name, type (monthly / event), start date |
| Add shared expense | Amount, category, paid by, date; optional “from my wallet” |
| FAB Add expense | Optional “Link to household ledger” |
| Reports | Section: Household ledger report (month picker) |
| Event close | Dialog: “Close Wedding 2026? Total spent: …” |

Keep personal **Wallets** page private; household is a separate space so users don’t confuse Meezan with “family book”.

---

## 11. API sketch (backend)

```
POST   /api/households/
GET    /api/households/
POST   /api/households/{id}/invite/          → { code }
POST   /api/households/join/                 → { code }

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

## 12. Settlement (phase 2 — optional)

Equal split among N active members:

```
fair_share = total_spent / N
owed[member] = fair_share - paid_by[member]
```

Show who should pay whom (simplify debts).  
Unequal splits / custom ratios later.

**v1 can skip settlement** and only show “who paid what” + totals — still valuable for families.

---

## 13. Implementation phases

| Phase | Scope | Outcome |
|-------|--------|---------|
| **P0 — Research / schema** | This doc + migrations design | Agreed model |
| **P1 — MVP** | Household, members (invite code), one ongoing ledger, shared expenses CRUD, all members see feed + month total | Core “4 people see expenses” |
| **P2 — Link from personal expense** | FAB / Bills: “also post to household ledger” | Linked personal + shared |
| **P3 — Event ledgers** | Create event, close with snapshot, read-only after close | Wedding / trip use case |
| **P4 — Reports** | Category + member breakdown, export optional | “Complete expense breakdown” |
| **P5 — Settlements** | Equal-split suggestions | Reduce WhatsApp math |
| **P6 — Polish** | Push/email when someone adds expense, roles, leave household | Sticky engagement |

Estimated effort (rough):

- P1: ~1–1.5 weeks  
- P2–P3: ~1 week  
- P4–P5: ~1 week  

Depends on polish level and mobile UX.

---

## 14. Risks & decisions to lock early

| Topic | Recommendation |
|-------|----------------|
| Does shared expense always hit a personal wallet? | **Optional** — “wallet + household” or “household only” |
| Can non-payers edit others’ lines? | **No** — only own, unless admin |
| Closed event reopen? | Owner/admin only, with confirm |
| Multiple households per user? | **Yes** (e.g. parents’ home + flatmates) |
| Currency mix | One currency per household |
| Delete member with history | Soft-leave; keep their past `paid_by` name |
| Requirements doc conflict | Update requirements: add optional **Household sharing** as an exception to pure isolation |

---

## 15. How this maps to your example

> 4 family members, each with CashTrail accounts, share one household expense account.

1. One member creates **Household** + ledger **“Family home”** (`ongoing`).
2. Other three join via code.
3. X adds expense 2,000 groceries → linked to X’s Meezan (optional) + household ledger.
4. Y, Z, W open Household → see X’s line instantly.
5. Month report: total, by category, by who paid.
6. For a wedding: create ledger **“Wedding”** (`event`) → all log spends → **Close event** → final total locked; all four still view history.

---

## 16. Open questions for product owner

1. Should household expenses **always** reduce someone’s personal wallet, or allow shared-only entries?
2. Equal split settlement in v1, or totals-only first?
3. Max members per household?
4. Nav label: **Household** vs **Shared** vs under **Wallets**?
5. Should income into a family pot (contributions) be supported, or expense-only first?
6. Notifications when a member posts an expense?

---

## 17. Recommendation (summary)

Build a **Household + HouseholdLedger + HouseholdExpense** layer beside personal wallets (Option B).

- Do **not** overload personal `Account` as multi-owner.
- Support **ongoing monthly** and **event** ledgers with close.
- Let personal expenses optionally **link** into a household ledger so the payer’s wallet stays accurate and everyone sees the shared book.
- Ship **P1 visibility + shared log** first; then linking, event close, rich reports, settlements.

This stays compatible with CashTrail’s private multi-tenant design while adding intentional, permissioned family sharing.
