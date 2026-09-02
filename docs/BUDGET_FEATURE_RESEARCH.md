# Budget Feature — Research & Implementation Plan

**Status:** Research / not implemented  
**Reference UI:** Category list with monthly spend + “Set” per category (see attached screenshot)  
**App context:** CashTrail — PKR-first personal finance (wallets, income/expense, bank SMS, family/household, reports)

---

## 1. What we are trying to solve

Users want to answer three questions every month:

1. **How much did I plan to spend?** (budget limit)
2. **How much have I spent so far?** (actual, this month)
3. **Am I on track or overspending?** (remaining / over by category)

This is separate from but related to:

| Existing feature | What it does today | Budget adds |
|------------------|-------------------|-------------|
| **Transactions** | Records income & expense with category | Feeds “spent so far” |
| **Dashboard / Reports** | Shows month totals & category donut | Shows limits & progress bars |
| **Wallets** | Where money lives | Budgets are usually **global per user**, not per wallet (v1) |
| **Family / Household** | Shared ledger + split equal | **Personal budgets ≠ household budgets** (see §8) |

---

## 2. Reference app pattern (screenshot)

Typical “Budgets” screen structure:

```
┌─────────────────────────────────┐
│ Budgets                    [+]  │
│ [ This month ▼ ]                │
├─────────────────────────────────┤
│ Set a budget                    │
│                                 │
│ 🍔 Food & Drink    £10   [Set] │
│ 🛍 Shopping        £0    [Set] │
│ 🚗 Transport       £0    [Set] │
│ ...                             │
└─────────────────────────────────┘
```

**Behaviours implied:**

- Time scope: **This month** (with prev/next or picker)
- One row per **expense category**
- Shows **spent this month** even before a limit is set
- **Set** opens flow to define a monthly limit (e.g. PKR 15,000 for Food)
- Optional **All** row = total monthly budget (sum of categories or one overall cap)

**CashTrail adaptation:** Use PKR, existing category icons/colours from `mobile/src/constants/categories.ts` and `frontend/src/constants/categories.ts`.

---

## 3. What CashTrail already has (foundation)

### Data

| Piece | Location | Notes |
|-------|----------|-------|
| Expense categories | `EXPENSE_CATEGORIES` (14 categories) | Food & Drink, Transport, Bills & Utilities, etc. |
| Transactions | `Transaction` model — `type`, `amount`, `date`, `category` | Source of truth for spend |
| Month aggregation | `DashboardView` — `month_income`, `month_expense` | Calendar month in server TZ |
| Category breakdown | `Dashboard.tsx`, `reports.tsx` — client-side group by category | Same logic budget can reuse |
| Exclusions | `Bank Transfer` category skipped in charts | Budgets should skip transfers too |

### UI surfaces

| Platform | Closest existing screen |
|----------|-------------------------|
| **Mobile** | Home, Reports tab (category donut, month picker) |
| **Web** | Dashboard (donut + month stats) |
| **Admin** | No user budget UI today |

### Gaps (must build)

- No `Budget` model or API
- No “limit vs spent” UI
- No alerts when over budget
- No “Set budget” modal/sheet
- No offline cache for budget rows

---

## 4. Recommended product scope

### Phase 1 — MVP (ship first)

**Personal monthly category budgets**

- User sets a **PKR limit per expense category** for **calendar month**
- Budgets screen lists all expense categories (or only categories with spend / with a limit set)
- Each row shows:
  - Category icon + name
  - **Spent** this month
  - **Limit** (if set) or **Set** button
  - Progress bar: `spent / limit` (green → amber → red when over)
- **Overall budget** (optional single row “All expenses”) — limit on total monthly spend
- Scope: **personal transactions only** (`Transaction` where `type=expense`, exclude `Bank Transfer`)
- Period: **This month** only in v1 (prev/next month in v1.1)
- Sync: server-stored so web + mobile match

**Not in MVP:**

- Per-wallet budgets
- Household/family shared budgets
- Rollover unused budget to next month
- Income budgets (“earn at least X”)
- Push notifications for overspend (Phase 2)

### Phase 2 — Alerts & polish

- Notify when category reaches 80% / 100% of limit
- Home card: “Food & Drink — PKR 12,400 / 15,000”
- Copy last month’s budgets to this month
- Budget vs actual in PDF/CSV report export

### Phase 3 — Advanced (optional)

- Weekly budgets
- Custom categories (user-defined)
- Budget templates (“Student”, “Family of 4”)
- Envelope / zero-based budgeting
- Link budget to a specific wallet (e.g. “Cash only”)

---

## 5. How the feature works (logic)

### 5.1 Definitions

| Term | Meaning |
|------|---------|
| **Budget period** | Calendar month `YYYY-MM` (user’s profile timezone or UTC — **decide once**, document in API) |
| **Category key** | String matching `Transaction.category` (e.g. `"Food & Drink"`) |
| **Limit** | Max PKR user allows for that category in that month |
| **Spent** | Sum of `expense` transactions in that month for that category |
| **Remaining** | `max(0, limit - spent)` |
| **Over** | `max(0, spent - limit)` when limit > 0 |

### 5.2 Spent calculation (server)

```python
# Pseudocode — align with dashboard month boundaries
expenses = Transaction.objects.filter(
    user=user,
    type='expense',
    date__year=year,
    date__month=month,
).exclude(category='Bank Transfer')

by_category = expenses.values('category').annotate(spent=Sum('amount'))
```

**Special row “All”:**

- `spent_all` = sum of all expense categories above
- `limit_all` = optional user-defined total cap (separate budget row with `category='__all__'`)

### 5.3 Progress & status

| Condition | UI status |
|-----------|-----------|
| No limit set | Show spent only + **Set** |
| spent ≤ 80% of limit | Green progress |
| 80% < spent ≤ 100% | Amber / “Almost there” |
| spent > limit | Red + “Over by PKR X” |

### 5.4 User flows

**A. View budgets**

1. Open **Budgets** tab (mobile) or **Budgets** nav item (web)
2. Default: **This month**
3. See list sorted by: (1) categories over budget, (2) categories with limits, (3) rest by spent desc

**B. Set / edit budget**

1. Tap **Set** on a category
2. Sheet/modal: “Monthly limit for Food & Drink”
3. Input PKR amount (or “No limit” to clear)
4. Save → API upsert → list refreshes

**C. Quick set from transaction**

1. After adding expense, optional chip: “Set budget for Food & Drink?”
2. Pre-fills category from transaction

**D. Home insight (Phase 2)**

1. Dashboard shows top 1–2 categories closest to limit

---

## 6. Data model (proposed)

### New table: `CategoryBudget`

```python
class CategoryBudget(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='category_budgets')
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()  # 1–12
    category = models.CharField(max_length=100)  # expense category key, or '__all__' for total
    limit_amount = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('user', 'year', 'month', 'category')]
```

**Notes:**

- Store **limit only** — spent is always computed live from transactions (never stale)
- Delete row or set limit to null = no budget for that category
- No FK to category table (categories are strings today) — matches existing `Transaction.category`

---

## 7. API design (proposed)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/budgets/?year=2026&month=9` | List rows: category, limit, spent, remaining, percent, status |
| `PUT` | `/api/budgets/` | Upsert one `{ year, month, category, limit_amount }` |
| `DELETE` | `/api/budgets/{id}/` | Remove limit for category/month |
| `POST` | `/api/budgets/copy-from-previous/` | Copy all limits from prior month (Phase 2) |

**Example `GET` response:**

```json
{
  "year": 2026,
  "month": 9,
  "period_label": "September 2026",
  "currency": "PKR",
  "total_spent": 45200.0,
  "total_limit": 60000.0,
  "rows": [
    {
      "category": "Food & Drink",
      "limit": 15000.0,
      "spent": 12400.0,
      "remaining": 2600.0,
      "percent": 82.7,
      "status": "warning",
      "has_limit": true
    },
    {
      "category": "Transport",
      "limit": null,
      "spent": 3200.0,
      "remaining": null,
      "percent": null,
      "status": "unset",
      "has_limit": false
    }
  ]
}
```

---

## 8. Household / family — keep separate

**Do not mix** personal budgets with `HouseholdLedger` in v1.

| | Personal budget | Household ledger |
|--|-----------------|------------------|
| Data | `Transaction` | `HouseholdExpense` |
| Who | One user | All members |
| Split | N/A | Split equal |
| UI | Budgets tab | Family tab |

**Future:** “Household budget” for shared categories — separate model tied to `household_id`.

---

## 9. Edge cases & rules

| Case | Recommended rule |
|------|------------------|
| **Bank Transfer** | Exclude from budget spent (same as reports) |
| **Income** | Not counted against expense budgets |
| **Bank SMS auto-import** | Counts when approved transaction exists |
| **Travel Mode** | Amount stored in PKR — budget uses PKR |
| **Month boundary** | Budgets keyed by year/month; spent uses transaction `date` |
| **Timezone** | Match dashboard / user profile |

---

## 10. UI placement

### Mobile

**Recommended:** New **Budgets** tab (like the reference screenshot)

- Summary card: total spent vs total budget
- Category list with progress + **Set** / **Edit**

### Web

- Route `/budgets` + nav link in `Layout.tsx`

---

## 11. Implementation phases

| Phase | Work |
|-------|------|
| **A — Backend** | `CategoryBudget` model, `/api/budgets/`, tests |
| **B — Web** | `Budgets.tsx`, set-limit modal |
| **C — Mobile** | `budgets.tsx` tab, bottom sheet |
| **D — Polish** | Alerts, copy last month, Home widget |

**Rough effort:** A 1–2d, B 1–2d, C 2–3d, D 2+d

---

## 12. Decisions before build

1. **New tab vs under Reports?** → Recommend **Budgets tab** + `/budgets` route  
2. **Overall “All” budget row?** → Yes  
3. **Household budgets in v1?** → No  
4. **Rollover?** → No in v1  

---

## 13. Summary

**Phase 1:** Personal monthly PKR limits per category, spent from transactions, progress UI like the reference screenshot, synced on web + mobile.

**Reuse:** `EXPENSE_CATEGORIES`, Dashboard month logic, Reports aggregation.

**Defer:** Family budgets, rollover, income targets, per-wallet envelopes.

---

*Related:* `docs/CASHTRAIL_USER_GUIDE.md`, `docs/TRAVEL_AND_PEOPLE_PHASES.md`
