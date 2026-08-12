# Travel Mode + People — Development Phases

**Status:** Phase A + B implemented (backend + mobile Travel Mode UI). Phases C–F not started.  
**Home currency:** PKR (from the user profile). All wallet balances, reports, and totals stay in PKR.  
**Reference:** Hysab Kytab Travel Mode + person History screens.

---

## What we are building

### 1. Travel Mode

When Travel Mode is **on** (e.g. Dubai / AED):

- The user types amounts in **AED**.
- The app shows a clear line: *Travel Mode on · 1 AED = 73.26 PKR*.
- CashTrail converts to PKR and **saves PKR** on the wallet (books never mix currencies).
- Lists can show both: `AED 50` · `PKR 3,663`.

When it is **off**, nothing changes — input and display stay PKR.

### 2. People (lend / borrow / pay / receive)

A **person** is a balance sheet, not a bank:

| Action | Wallet | Person |
|--------|--------|--------|
| **Lend** 500 from Meezan to Hussain | Meezan **−500** | Hussain **+500** (he owes you) |
| **Borrow** 500 from Hussain into Cash | Cash **+500** | Hussain **−500** (you owe him) |
| **Receive** 500 from Hussain into Meezan | Meezan **+500** | Hussain **−500** (debt down) |
| **Pay** 500 from Meezan to Hussain | Meezan **−500** | Hussain **+500** (your debt down) |

Person net:

- **Positive** → they owe you  
- **Negative** → you owe them  
- **Zero** → settled  

---

## Placement (keep it uncrowded)

### Travel Mode — not on the + dialog

The + sheet already has Expense / Income / Transfer. Travel Mode is a **session**, not a transaction type.

| Place | What the user sees |
|-------|--------------------|
| **Home** | Small “Travel” chip in the header (plane icon). Off = muted. On = primary + `AED`. |
| **Dedicated screen** `/travel-mode` | Hysab-style: intro when off; when on: From PKR → To AED, live rate, start/end dates, **Set / Turn off**. |
| **Settings** | One row: Travel Mode · Off / AED — opens the same screen. |
| **+ Add Transaction** | **Banner only** (no extra tabs): “Travel Mode · amounts in AED · 1 AED = 73.26 PKR”. Amount label switches PKR → AED. |
| **Wallets / Home / Recent** | Tiny AED subtitle on rows dated inside the travel window. |

Do **not** put a currency picker on every form.

### People — on the + dialog, as one extra segment

Today:

```
[ Expense ]  [ Income ]  [ Transfer ]
```

After (four equal pills — still one row):

```
[ Expense ]  [ Income ]  [ Transfer ]  [ People ]
```

When **People** is selected, the rest of the sheet **replaces** category chips (do not stack extra rows):

```
[ Lend ]  [ Borrow ]     ← two chips only
From wallet:  Meezan / Cash / …
Person:       Hussain najmi  |  + New person
Amount
```

**Pay** and **Receive** stay **off** this dialog. They live on the person History screen (four actions there is enough).

Person History (`/people/[id]`), matching the screenshot:

- Month strip, net card (Inflow / Outflow / opening)
- Four actions: **Lend · Borrow · Pay · Receive**
- Transaction list (`Cash → Hussain`, `Hussain → Cash`)

**Wallets tab** — new section under Cash, not mixed into bank tiles:

```
Bank wallets
Cash & wallets
People          ← Hussain +500 / you owe −200
```

Tapping a person opens History. Creating a person is only from People flow or “+ New person”, not from “Create Wallet”.

---

## Product rules

### Travel Mode

1. One active trip at a time. Home currency is always PKR.  
2. Store: `enabled`, `travel_currency` (AED), `rate` (PKR per 1 foreign unit), `start_date`, `end_date`.  
3. Rate is **locked** when the user taps **Set Travel Mode** (see Exchange rates below).  
4. Auto-off after `end_date` (soft: banner “trip ended — turn off?”).  
5. Convert on save: `pkr = round(foreign * rate, 2)`.  
6. Persist on the transaction: foreign amount, currency, rate used (so history stays correct if the rate changes later).  
7. Transfers, bills, income sources, household: **PKR only** in v1. Travel Mode affects **daily + / People amounts** only.  
8. Offline: last saved rate; no live FX until online.

---

## How exchange rates are managed

Books are always PKR. The rate only answers: *how many rupees is 1 unit of the travel currency?*

Display format (same as Hysab Kytab): **`1 AED = 73.26 PKR`**  
Never the inverse on the main UI (`1 PKR = 0.013 AED`).

### Two rates (do not mix them)

| Rate | When it is used | Can it change later? |
|------|-----------------|----------------------|
| **Trip rate** | Shown on Travel Mode + the + banner. Used as the *default* for new entries. | Yes — Refresh or manual edit. Does **not** rewrite old transactions. |
| **Entry rate** | Copied onto **that** income/expense/people line at save time. | No. History always uses the rate stored on the row. |

Example: Monday you set 1 AED = 73.26. You log 50 AED → wallet −3,663 PKR. Wednesday you refresh to 74.00. Monday’s 50 AED stays 3,663 PKR. New entries use 74.00.

### Where the number comes from

1. **Server fetch (default)**  
   Mobile/web never call an FX vendor directly (no keys on the client).  
   `GET /api/fx/?base=AED&quote=PKR`  
   Django fetches a public mid-market feed, stores it, returns `{ rate, as_of, source }`.

2. **Cache**  
   Table `FxRateCache`: `base`, `quote`, `rate`, `fetched_at`, `source`.  
   Reuse if younger than **6 hours**. If the vendor is down, return the last cache even if stale, plus `stale: true`.

3. **Trip lock**  
   On **Set Travel Mode**, copy the quoted rate onto the user’s travel session (`rate`, `rate_as_of`, `rate_source`). That is the trip rate until they refresh or type a new one.

4. **Manual rate (required)**  
   Travellers often use a **street / exchange-booth** rate, not mid-market.  
   Travel Mode screen: rate field is editable.  
   “Use live rate” fills from `/api/fx/`.  
   “Use this rate” saves whatever they typed (min/max sanity check, e.g. AED→PKR between 20 and 200).

5. **Refresh**  
   Button on Travel Mode (and optional on the + banner). Updates the **trip rate** only. Confirm: “New entries will use 1 AED = 74.00 PKR. Past entries stay as they are.”

6. **Offline**  
   No network → do not block Set or Add. Use last trip rate, or last `FxRateCache` pulled while online. Banner: “Using saved rate (offline)”.  
   If they have **never** had a rate (first trip, never online): they **must type** a rate before Set.

7. **Per transaction**  
   Save always:

   - `amount` = PKR (wallet truth)  
   - `original_amount` = what they typed (AED)  
   - `original_currency` = `AED`  
   - `fx_rate` = PKR per 1 AED used for this row  
   - `fx_source` = `live` | `manual` | `cached` | `offline`

   Formula: `amount = round(original_amount * fx_rate, 2)`.

8. **Display after the fact**  
   Lists: `AED 50` · `PKR 3,663` using **that row’s** `fx_rate`, not today’s trip rate.  
   Reports / wallet totals: PKR only.

### Vendor & fallback (Phase A)

Pick one primary, one fallback — both **no API key** for v1 (swap later if we need a paid feed):

| Priority | Source | Notes |
|----------|--------|--------|
| 1 | [open.er-api.com](https://open.er-api.com/v6/latest/AED) | Free, `rates.PKR` = PKR per 1 AED |
| 2 | [Frankfurter](https://api.frankfurter.app) or jsDelivr currency JSON | Only if primary fails |
| 3 | Last `FxRateCache` row | Stale but better than blocking |
| 4 | User-typed rate | Always allowed |

Do **not** scrape random websites. Do **not** store vendor keys in the Expo/web apps.

### Currencies in v1

Short list (ISO codes), not every world currency:

`AED, SAR, USD, EUR, GBP, TRY, MYR, THB, CNY, QAR, OMR, BHD, KWD, INR`

Home is always `PKR`. If `base === PKR`, Travel Mode is off (no conversion).

### What we will not do in v1

- Intra-day rate charts or “best rate” alerts  
- Different rates per wallet (Meezan vs cash booth)  
- Revaluing old trips when the market moves  
- Crypto or gold  

Phase F can add: daily auto-refresh of the trip rate while the trip is active (still never rewrite old rows).

### People

1. Person is an `Account` with type `person` (same balance math: income minus expense).  
2. Each action is **two** PKR legs (same as Transfer today):

| Action | Wallet leg | Person leg | Meaning |
|--------|------------|------------|---------|
| Lend | expense | income | You gave them cash |
| Borrow | income | expense | You took their cash |
| Receive | income | expense | They paid you back |
| Pay | expense | income | You paid them back |

3. Notes distinguish Lend vs Pay (both look like wallet− / person+).  
4. People **do not** count in “What you have” / combined wallet total. Combined = bank + cash only.  
5. Person net is **not** income/expense of the month. Reports: filter “People” or exclude from spending chart.  
6. Cannot delete a person with a non-zero balance (settle first).  
7. Travel Mode can apply to People amounts the same way (type AED, store PKR).

---

## Architecture (when we build)

**Backend**

- `Account.type`: add `person`.  
- `Transaction`: `original_amount`, `original_currency`, `fx_rate` (nullable).  
- `TravelMode` (one row per user) or fields on `UserProfile`.  
- `GET /api/fx/?base=AED&quote=PKR` + `FxRateCache` (6h). Travel session stores locked trip rate; each transaction copies `fx_rate`.  
- Dashboard: `total_balance` ignores `person`; add `people[]` summary.  
- Person history endpoint: month filter, inflow/outflow, opening, lines.

**Mobile**

- `app/travel-mode.tsx`  
- `app/people/[id].tsx`  
- `add-transaction.tsx`: 4th segment + People sub-sheet  
- Wallets: People section  
- Home: Travel chip  
- Format helper: `fmtTravel(pkr, { currency, rate })`

**Web**

- Same placement: header chip, `/travel-mode`, People on add modal, Wallets section, person panel.

**Do not** add a 5th bottom tab. People live under Wallets + the + sheet.

---

## Phases

### Phase A — Data & FX (no UI polish) ✅ implemented

- Migration `0020_travel_people_phase_a`: `person` account type; FX + people fields on transactions; `TravelMode`; `FxRateCache`.  
- API: `/api/people/`, `/api/people/actions/`, `/api/people/{id}/history/`, `/api/travel-mode/`, `/api/fx/`.  
- Dashboard: wallets-only `total_balance`; `people[]` summary; people legs excluded from month income/expense.  
- Tests: `api.tests_travel_people` (double-entry, FX convert, stale cache, travel mode).  
- **Exit:** APIs work; app UI unchanged.  
- **Deploy:** `python manage.py migrate` on Railway after merge.

### Phase B — Travel Mode UI ✅ implemented (mobile)

- `/travel-mode` intro + setup (currency, dates, rate, Set / Off).  
- Home chip + Settings row.  
- + sheet banner + foreign amount when on; save PKR + FX metadata (offline queue included).  
- Recent rows: foreign subtitle when FX fields present.  
- **Exit:** trip to AED, log expense 10 AED, wallet drops ≈732.6 PKR, banner visible.  
- **Needs:** Phase A migrated on the API (`0020_travel_people_phase_a`).

### Phase C — People on the + dialog

- 4th segment **People** → Lend / Borrow only.  
- Create person inline.  
- Wallets tab: People list (excluded from combined).  
- **Exit:** lend 500 Meezan → Hussain; balances match the table above.

### Phase D — Person History

- History screen: month strip, net card, Lend / Borrow / Pay / Receive, list.  
- Pay / Receive only here (keeps + dialog small).  
- Empty / settled copy: “No pending debts”.  
- **Exit:** full cycle lend → receive → net 0.

### Phase E — Web parity

- Same flows on web add-modal, wallets, travel page, person panel.  
- **Exit:** mobile and web same rules.

### Phase F — Hardening (optional)

- Optional daily auto-refresh of **trip** rate (never rewrite old rows); trip-ended prompt; hide amounts on people; CSV; reminders “Hussain owes you”.

---

## UI sketch — + dialog (People selected)

```
┌─────────────────────────────────┐
│  Add Transaction            ✕   │
│  [Expense][Income][Transfer][People] │
│                                 │
│  ┌ Travel Mode · AED        ┐   │  ← only if travel on
│  │ 1 AED = 73.26 PKR        │   │
│  └──────────────────────────┘   │
│                                 │
│         AED  [ 500 ]            │  ← or PKR if travel off
│                                 │
│  [ Lend ]  [ Borrow ]           │
│                                 │
│  From wallet                    │
│  (○ Meezan)  (○ Cash)           │
│                                 │
│  Person                         │
│  (○ Hussain)  (+ New)           │
│                                 │
│  [ Add details ]                │
│  [ Save ]                       │
└─────────────────────────────────┘
```

Expense / Income / Transfer stay as they are today. People **replaces** the category row — never show categories + lend/borrow together.

---

## Suggested build order

`A → B → C → D → E`  
(Travel first so the + sheet banner exists before People; People History last so Pay/Receive have a home.)

Web (`E`) can start after `C` if needed.

---

## Out of scope (v1)

- Multi-currency wallets (Meezan in AED)  
- Travel Mode on bills / salary / household ledgers  
- Splitting a bill with a person (that is Family)  
- Interest, due dates, or “loan product” on a person  
- More than one active travel currency  

---

## Acceptance (when a phase ships)

**Travel:** Set AED + dates → + shows AED + rate → expense converts to PKR → turn off → PKR again.  
**People:** Hussain appears under Wallets, not in combined total → Lend/Borrow from + → History Pay/Receive → net matches the four-action table.

---

*Next step when ready: start Phase A (backend only).*
