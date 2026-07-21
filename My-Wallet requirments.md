# CashTrail — Requirements Document

## 1. Overview

**CashTrail** is a personal/business finance management app for a freelancer/business owner who earns income from multiple projects with different payment models (one-time, monthly recurring, multi-part one-time, installment-based) and holds money across multiple bank accounts and physical cash. The app tracks every rupee coming in and going out, shows real-time balances per account, and forecasts the financial outcome of the current month.

**Platform:** Mobile-first, responsive on laptop/desktop. Simple, uncluttered UI — no unnecessary screens or steps.

**Primary user (v1):** Single user (owner), using it for personal/business finance tracking.

**Future direction (multi-tenant):** The app must be architected so it can later be opened up as a hosted product where multiple independent users sign up and each manages their own private financial data within the same app instance. Each user's accounts, projects, transactions, and installments are isolated — no user can see another user's data. This is **not** a shared/team workspace (one company's books shared by many people); it's many separate users, each with their own private CashTrail space, hosted on one app. The data model and auth system should be built with this in mind from the start, even though v1 may launch with just the owner as the only real user.

---

## 2. Core Goals

1. Track all income sources (projects) regardless of payment model.
2. Track all expenses (fixed, recurring, one-time, installment-based).
3. Track balances across multiple bank accounts + cash in hand, and know how much is in each.
4. Track money owed *to* the user that's being paid in installments (receivables).
5. Track money the user owes that's being paid in installments (payables/loans).
6. Generate a **monthly forecast report**: total expected income − total expected outgoing = net savings/loss for the month.
7. Show actual recorded income/expense for the month vs. the forecast.
8. Support multiple independent users on one hosted app instance in the future, each with completely private, isolated data (built into the architecture from day one, even if v1 ships with a single user).

---

## 3. Core Entities (Data Model)

### 3.0 User
Represents an individual account holder. Every other entity below (Account, Project, Transaction, Expense, Installment) belongs to exactly one User — all data is scoped/filtered by `user_id` so each user only ever sees their own records.

| Field | Type | Notes |
|---|---|---|
| id | string | unique |
| name | string | |
| email | string | unique, used for login |
| password_hash | string | never store plain text |
| currency | string | default "PKR", per-user setting |
| created_at | date | |
| status | enum | `active`, `suspended` (for future admin control) |

> **Note:** Every entity in 3.1–3.6 includes a `user_id` (reference → User) field, even though it's not repeated in every table below for brevity. All queries, balances, and reports are always scoped to the logged-in user's own `user_id`.

### 3.1 Account
Represents a place where money is held.

| Field | Type | Notes |
|---|---|---|
| id | string | unique |
| user_id | reference → User | owner of this account |
| name | string | e.g. "Meezan Bank", "NayaPay", "SadaPay", "Cash in Hand" |
| type | enum | `bank`, `cash` |
| current_balance | number | auto-calculated from transactions, but editable to set an opening balance |

### 3.2 Project (Income Source)
Represents a source of income — could be a client project, retainer, or product.

| Field | Type | Notes |
|---|---|---|
| id | string | unique |
| user_id | reference → User | owner of this project |
| name | string | e.g. "ERP - Client A", "Contract Project", "Sooicy" |
| income_type | enum | `recurring_monthly`, `one_time`, `one_time_installments`, `contract_monthly` (see 3.4 below) |
| amount | number | full value (or monthly value for recurring) |
| status | enum | `active`, `completed`, `paused` |
| start_date | date | |
| default_account | reference → Account | where payments normally land |
| notes | text | optional |

**Income type explanation:**
- `recurring_monthly` — fixed amount every month (e.g. ERP maintenance @ 8,000/month) — continues indefinitely until paused/stopped.
- `contract_monthly` — fixed monthly amount tied to a contract with a defined or open-ended duration (e.g. 25,000/month contract).
- `one_time` — single payment, single project (e.g. a one-off website build paid in full).
- `one_time_installments` — total project value paid in parts over time (e.g. ERP worth 75,000 in 3 parts; website worth 30,000 paid as 5,000/month). This generates linked **Receivable Installment** records (see 3.5).

### 3.3 Transaction (Income or Expense — actual recorded money movement)

| Field | Type | Notes |
|---|---|---|
| id | string | unique |
| user_id | reference → User | owner of this transaction |
| type | enum | `income`, `expense` |
| amount | number | |
| date | date | actual date money moved |
| account | reference → Account | which account/cash it hit or left |
| linked_project | reference → Project | optional, for income tied to a project |
| linked_installment | reference → Installment | optional, for installment payments |
| category | string | for expenses: e.g. Utilities, Server, Food, Rent, Loan Repayment |
| status | enum | `received`/`paid` (actual) — used to distinguish from forecasted/pending items |
| notes | text | optional |

This is the single source of truth for actual money movement and drives account balances and "actual" monthly totals.

### 3.4 Expense (Recurring / Fixed)
For predictable monthly costs not tied to an installment.

| Field | Type | Notes |
|---|---|---|
| id | string | |
| user_id | reference → User | owner of this expense |
| name | string | e.g. "Utilities", "Server Charges" |
| amount | number | |
| frequency | enum | `monthly`, `one_time` |
| due_day | number | day of month it's expected (for forecasting) |
| account | reference → Account | default payment account |
| active | boolean | |

### 3.5 Installment (Receivable — money owed TO the user)
For project income being paid in parts.

| Field | Type | Notes |
|---|---|---|
| id | string | |
| user_id | reference → User | owner of this installment |
| linked_project | reference → Project | |
| total_amount | number | e.g. 30,000 |
| monthly_amount | number | e.g. 5,000 |
| total_installments | number | |
| installments_received | number | auto-incremented |
| remaining_amount | number | auto-calculated |
| start_date | date | |
| status | enum | `ongoing`, `completed`, `stuck` (for the "one project's money is stuck" case) |

### 3.6 Installment (Payable — money the user owes)
For loans / commitments being paid back over time.

| Field | Type | Notes |
|---|---|---|
| id | string | |
| user_id | reference → User | owner of this installment |
| name | string | e.g. "Engagement Loan", "Land Payment" |
| total_amount | number | e.g. 100,000 |
| monthly_amount | number | e.g. 10,000 |
| total_installments | number | e.g. 10 |
| installments_paid | number | auto-incremented |
| remaining_amount | number | auto-calculated |
| due_day | number | day of month payment is due |
| account | reference → Account | default payment account |
| status | enum | `ongoing`, `completed` |

---

## 4. Feature Modules

### 4.1 Dashboard (Home)
- Total balance across all accounts + cash (net liquid worth), shown prominently at top.
- Per-account balance cards (Meezan Bank, NayaPay, SadaPay, Cash in Hand, etc.) — tap to see that account's transaction history.
- This month's quick summary: Expected Income, Expected Outgoing, Net (Save/Loss) — see Module 4.5.
- Recent transactions list (last 5–10).
- Quick-add buttons: "+ Income", "+ Expense".

### 4.2 Projects (Income Sources)
- List of all projects with: name, income type, monthly/total value, status.
- Add/Edit/Pause/Complete a project.
- When a project is added, it should automatically factor into future monthly forecasts (per its income_type rules).
- Tapping a project shows its full payment history and (if installment-based) progress: e.g. "2 of 6 installments received, 20,000 of 30,000 received, 10,000 remaining."
- Ability to mark a project/installment as **stuck/overdue**.

### 4.3 Accounts
- List of all accounts (banks + cash) with current balance.
- Add/edit/remove an account; set opening balance.
- Each account's transaction history (filterable by date, income/expense).
- Manual balance adjustment option (for corrections/reconciliation).

### 4.4 Expenses & Payables
- List of fixed recurring expenses (Utilities, Server Charges, etc.) — add/edit/deactivate.
- List of payable installments/loans (Engagement Loan, Land Payment, etc.) — add/edit, track progress (e.g. "3 of 10 paid, 70,000 remaining").
- Log a one-time expense directly.
- Each item shows next due date and amount.

### 4.5 Monthly Report / Forecast
This is the core "smart" feature.

**For a selected month, the app calculates:**

- **Expected Income** = sum of:
  - all `recurring_monthly` and `contract_monthly` project amounts active that month
  - any `one_time_installments` due that month (per linked Installment-Receivable)
  - any `one_time` project payments scheduled that month
- **Expected Outgoing** = sum of:
  - all active fixed recurring expenses due that month
  - all payable installment amounts due that month
  - any one-time expenses already logged/planned for that month
- **Net Forecast** = Expected Income − Expected Outgoing → shown as "You will earn X, pay Y, and save Z" (or "you will be short by Z" if negative).
- **Actual vs Forecast**: as real transactions are logged through the month, show actual income/expense recorded so far next to the forecast, so the user can see if they're on track.

**Worked example (per user's own numbers), app should reproduce this exact kind of output:**

> **July Forecast**
> Income: Contract Project 25,000 + ERP 8,000 + Sooicy 5,000 = **38,000**
> Outgoing: Engagement Loan 10,000 + Utilities 10,000 + Server Charges 1,000 + Land 10,000 = **31,000**
> **Net: You will save 7,000 this month.**

(Note: the user's own example arithmetic summed to 11,000 saved, but 38,000 − 31,000 = 7,000 — the app's calculation logic must always do correct math regardless of any manual example errors.)

- Month selector (view past months, current month, and a forward-looking forecast for future months based on recurring items).
- Visual summary (simple bar or donut chart: Income vs Expense vs Saved) — optional, keep minimal.

### 4.6 Add Transaction (Income / Expense) — Quick Entry
- Simple form: Type (Income/Expense), Amount, Account, Date, Category/Project link, Notes.
- If linked to an installment (receivable or payable), auto-update that installment's progress and remaining amount.
- If linked to a project, auto-link to project history.

### 4.7 Settings
- Manage profile (name, email, password change).
- Manage accounts list.
- Manage expense categories.
- Currency setting (default PKR).
- Data export (CSV/PDF) of transactions — optional for v1.
- Backup/restore data — optional for v1.
- Logout.

### 4.8 Authentication & Multi-User Support
- Sign up (email + password) / Login / Logout / Forgot-password flow.
- Each signup creates a new isolated User record; all subsequent data (accounts, projects, transactions, installments) is created under and filtered by that `user_id`.
- Session/token-based authentication (e.g. JWT) so the backend can securely identify "who is asking" on every request.
- No user can ever query or see another user's accounts, projects, or transactions — enforced at the backend/database level, not just hidden in the UI.
- v1 can launch with just one real user (the owner) logged in, but login/signup screens and per-user data scoping should exist from the start so opening it up to other users later requires no data-model rework — just enabling public signup.
- (Future, post-v1) Admin view for the owner to see total registered users, basic usage stats, and to suspend/delete accounts if this becomes a hosted product for others.

---

## 5. Functional Requirements Summary

1. User can add/edit/delete Accounts (bank or cash) and see live balances.
2. User can add/edit/pause/complete Projects with one of four income types.
3. Adding a Project automatically reflects in future monthly forecasts without manual re-entry.
4. User can log actual Income/Expense transactions linked to an account, and optionally a project or installment.
5. System auto-calculates account balances from all transactions.
6. User can create Payable Installments (loans/debts) and Receivable Installments (client installment plans), and the system tracks remaining balance and progress automatically as payments are logged.
7. User can mark a receivable as "stuck" if payment is overdue/not coming.
8. System generates a Monthly Forecast Report (expected income − expected expenses = net) for any month, past or future.
9. System shows Actual vs Forecast for the current/past months.
10. Dashboard shows total net worth (all accounts + cash combined) and per-account breakdown at a glance.
11. All core actions (add income, add expense, view balances, view monthly report) reachable within 1–2 taps from the home screen.
12. Users can sign up and log in; each user only ever sees and manages their own data.
13. All backend queries are scoped by the authenticated user's `user_id` — data isolation is enforced server-side, not just in the app UI.

---

## 6. Non-Functional Requirements

- **Mobile-first**: primary design target is a phone screen; layout must scale cleanly up to laptop/desktop width (responsive, not two separate apps).
- **Simplicity**: minimal screens, minimal required fields, no clutter — favor a 3–4 tab bottom navigation (e.g. Dashboard, Projects, Accounts, Reports) over deep menus.
- **Speed**: adding a transaction should take under 10 seconds.
- **Accuracy**: all balance and forecast math must be calculated by the system, never manually entered/guessed.
- **Data privacy & isolation**: this is personal financial data — each user's data is private to them. Use a proper backend with authentication (not just local device storage) so the app can support multiple hosted users later; passwords hashed, sessions secured, no third-party data sharing.
- **Scalability**: backend/database design should comfortably support many users' worth of accounts/transactions without rework (i.e. design for multi-tenancy from the start, not bolted on later).
- **Offline-friendly** (nice-to-have): ability to add transactions offline and sync later.

---

## 7. Out of Scope (v1)

- Team/shared workspaces — i.e. multiple people collaborating on *one* set of books with roles/permissions. (Multiple separate users each with their own private data **is** in scope and required, per Section 4.8 — this exclusion is only about shared/collaborative access to a single user's data.)
- Invoicing or client-facing features.
- Tax calculation.
- Multi-currency support (single currency, PKR, for v1; per-user currency field exists for future flexibility).
- Bank account auto-sync/API integration (all entries are manual for v1).
- Payment gateway / subscription billing for hosted users (relevant only once this becomes a paid hosted product — not needed for v1).

---

## 8. Suggested Navigation Structure (Mobile)

```
Bottom Tabs:
[ Dashboard ]  [ Projects ]  [ Accounts ]  [ Reports ]
                                              + Floating "Add" button (Income/Expense) on every screen
```

# 9. Technology Stack & Architecture Recommendation

## Backend

**Recommended Framework:** Python Django + Django REST Framework

### Why Django?

-   Extremely secure (built-in authentication, CSRF protection, ORM)
-   Fast development speed
-   Excellent for financial applications
-   Handles complex business logic very well
-   Large community support
-   Easy integration with mobile apps
-   Highly scalable when deployed correctly

The backend should expose REST APIs that can later be consumed by: - Web
Application - Android App - iOS App - Desktop Applications (future)

This means the backend never needs to be rewritten.

## Frontend (Web)

**Recommended Framework:** React.js

Reasons: - Large ecosystem - Fast development - Component-based
architecture - Excellent API integration - Easy migration to React
Native later - Massive hiring community

Suggested UI Libraries: - Material UI - Tailwind CSS - React Query /
TanStack Query - React Hook Form

## Database

**Recommended:** PostgreSQL

Reasons: - ACID compliant - Excellent performance - Supports millions of
records - JSON support - Easy backups - Supported by Django

## Authentication

Recommended: - JWT Authentication - Refresh Tokens - Secure password
hashing - Email verification - Password reset via email

Future: - Google Login - Apple Login - Microsoft Login

## Deployment

Backend: - Railway - Render - DigitalOcean - AWS EC2

Frontend: - Vercel - Netlify

Database: - Railway PostgreSQL - Supabase PostgreSQL - AWS RDS

## Storage

Recommended: - AWS S3 - Cloudinary - Supabase Storage

## API Architecture

``` text
React Web
    │
    ▼
REST API
    │
    ▼
Django REST Framework
    │
    ▼
PostgreSQL
```