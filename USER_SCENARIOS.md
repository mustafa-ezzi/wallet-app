# CashTrail — User Scenario Checklist

Use this file to walk through real user flows and mark each row **OK** or **BUG** (with notes).

**How to use**
1. Deploy / run backend + frontend with a fresh test account.
2. Follow each scenario in order (or jump to a section).
3. Fill `Result` with `OK` or `BUG`.
4. If BUG, add what you saw vs what you expected.

---

## A. Auth

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| A1 | Sign up | Create account with name, email, password | Lands on Overview / logged in | | |
| A2 | Sign in | Log out, sign in again | Session restored | | |
| A3 | Bad password | Wrong password on login | Clear error, stay on login | | |

---

## B. Accounts

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | Add bank | Accounts → New → Bank, opening 10,000 | Shows in Bank list, balance 10,000 | | |
| B2 | Add cash | Add Cash wallet opening 2,000 | Shows under Cash; combined = 12,000 | | |
| B3 | Edit account | Rename bank | Name updates everywhere | | |
| B4 | Delete account | Delete empty cash wallet | Removed; combined updates | | |

---

## C. Income (formerly “Projects”)

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| C1 | Monthly income | Income → Add → “Every month”, 50,000 | Listed as Active; label not “project” | | |
| C2 | Got paid | On monthly income → Got paid | Tx created; account balance up; “Received this month” | | |
| C3 | Delete income after payment | Record payment, then Delete income | Income gone; **past transaction remains**; balance still includes that income | | |
| C4 | One-time + advance | One-time 30,000, advance 10,000 | Remaining shows **20,000** (30k − 10k) | | |
| C4b | One-time Record payment | One-time with remaining → **Record payment** for remaining | Tx created; status → **completed**; drops from forecast | | |
| C5 | Paid in parts | Total 30,000, each payment 5,000 | Shows ~6 payments plan | | |
| C6 | Paid in parts + advance | Total 30,000, advance 5,000, each 5,000 | Remaining 25,000; months based on remaining | | |

---

## C2. Reports forecast tenure

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| F1 | Receivable 5k × 2 mo | Start Jan; open Reports Jan / Feb / Mar | Jan & Feb show **5,000**; Mar shows **0** for that item | | |
| F2 | Loan 3k × 3 mo | Loan with 3 installments; check 4 months from create | First **3** months show **3,000**; 4th month **0** | | |
| F3 | One-time unpaid | One-time remaining 10k, start this month | Forecast includes **10,000** until Record payment | | |

---

## D. Bills — Monthly costs

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| D1 | Two monthly costs | Add Maintenance 2,500 + Railway 1,500 | **Monthly Expenses strip = 4,000** (not 2,500) | | |
| D2 | Inactive cost | Toggle one inactive | Strip total drops by that amount | | |
| D3 | One-time cost | Add frequency one-time | Does **not** count in monthly strip | | |

---

## E. Bills — Loans you pay

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| E1 | Two loans | Loan A 10,000/mo + Loan B 5,000/mo | **Loan Payments strip = 15,000** | | |
| E2 | Record payment | Record Payment on a loan | Installments paid +1; remaining down | | |
| E3 | Delete loan | Delete on a loan | Loan removed; strip total updates | | |
| E4 | Mark complete | Mark Complete | Status completed; not in monthly loan total | | |

---

## F. Bills — Money owed to you

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| F1 | Add receivable | Link to income / enter totals | Appears in list; “Still Owed” updates | | |
| F2 | Record receipt | Record payment | Received count up; remaining down | | |

---

## G. Quick add (+)

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| G1 | Income via FAB | + → Income → amount + account | Balance increases | | |
| G2 | Expense via FAB | + → Expense | Balance decreases | | |
| G3 | Transfer | + → Transfer between accounts | Source down, dest up; combined same | | |

---

## H. Reports / Overview

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| H1 | Forecast income | Active monthly income exists | Reports expected income includes it | | |
| H2 | Forecast bills | Monthly costs + loans | Expected outgoing includes both | | |
| H3 | Overview chips | After txs this month | Month In / Out match recorded txs | | |

---

## I. Edge / bug hunts (lifecycle)

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| I1 | Delete income after payment | C3 above | Tx stays; balance OK; no crash | | |
| I2 | Delete account with txs | Try delete account that has txs | Blocked or cascades clearly (document actual) | | |
| I3 | Delete loan after payments | Pay once, then Delete loan | Loan gone; old expense txs remain | | |
| I4 | Double “Got paid” | Pay monthly income twice same month | Second blocked or warned | | |
| I5 | Advance > total | One-time total 10k, advance 15k | Validation error, not saved | | |

---

## J. PWA / polish

| # | Scenario | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| J1 | First login tour | New browser / clear `cashtrail_tour_v1_done` | Spotlight tour runs | | |
| J2 | FAB animation | Switch tabs | + button animates up | | |
| J3 | Install | Chrome Android → Install | Native install or clear instructions | | |

---

## Automated tests (backend)

From `backend/`:

```bash
python manage.py test api.tests_scenarios -v 2
```

Covers: expense/loan list math, loan delete, income → pay → delete income, one-time advance remaining, transaction delete restores balance.

---

## Bug report template

```text
Scenario ID:
Device / browser:
Steps:
Expected:
Actual:
Screenshot / network note:
OK or BUG:
```
