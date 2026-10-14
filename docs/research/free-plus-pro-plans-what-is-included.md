# WalletTrails — Free / Plus / Pro Packages (Research)

**Document type:** Product + engineering research (plan, not shipped code)  
**Product:** WalletTrails (Android + web + Django API)  
**Plans:** **Free → Plus → Pro** (strictly nested: each paid tier includes everything below it)  
**Related docs:** `docs/REVENUE_AND_LAUNCH_RESEARCH.md` (pricing & launch), `docs/ADSENSE_ADMOB_KNOWLEDGE.md` (ads), `docs/WALLETTRAILS_PRODUCT_GUIDE.md` (features)  
**Reviewed:** 7 October 2026  
**Status:** Research for how we define packages and how we **enforce** them so Free cannot use Plus/Pro, and Plus cannot use Pro.

---

## 1. Goal

Ship three clear packages:

| Package | Who it is for | One-line promise |
| --- | --- | --- |
| **Free** | Everyone | Honest personal tracker forever |
| **Plus** | Households & power trackers | Unlimited organization, sharing, no ads |
| **Pro** | Busy / multi-wallet users | Automation (SMS inbox, travel, PDF, smart rules) |

**Hard rule:** Features are **cumulative**.

- Free ⊂ Plus ⊂ Pro  
- A Free user must **not** get Plus or Pro capabilities.  
- A Plus user must **not** get Pro capabilities.  
- A Pro user gets Free + Plus + Pro.

Naming note: older docs and code say **Premium**. Treat **Pro = Premium**. Public UI can say **Pro**; store SKUs and backend product IDs can keep `premium_*` or migrate to `pro_*` (see §6).

---

## 2. Design principles

1. **Core money entry stays free** — add income / expense / transfer, view balances, privacy lock, basic reminders. Never sell “the ability to log a transaction.”
2. **Gate limits + automation + polish**, not accuracy or security.
3. **Server is the source of truth** — mobile/web UI can hide buttons, but the API must reject unauthorized use (otherwise a modified client or web call bypasses the paywall).
4. **Soft upgrade, not a crash** — when a Free user tries a Plus feature, show an upgrade sheet (“You’ve used 2 of 2 free wallets”) instead of a silent failure.
5. **Same feature matrix worldwide** — price localizes via Play regional pricing; plans do not.
6. **Ads only on Free** — Plus and Pro hide ads (`premium_hides_ads` already exists in ops config).

---

## 3. Feature matrix (what is in which package)

### 3.1 Side-by-side

| Feature | Free | Plus | Pro |
| --- | --- | --- | --- |
| Account, login, multi-account switch | Yes | Yes | Yes |
| Add income / expense / transfer | Unlimited | Unlimited | Unlimited |
| Privacy lock / hide amounts | Yes | Yes | Yes |
| Offline personal entries (mobile) | Yes | Yes | Yes |
| Bill reminders (local + push) | Yes | Yes | Yes |
| Personal wallets (bank / cash / card) | **2** | Unlimited | Unlimited |
| Active income sources | **2** | Unlimited | Unlimited |
| Active bills / payables / receivables (combined) | **3** | Unlimited | Unlimited |
| Category budgets / overall monthly cap | **1** per month | Unlimited + copy previous month | Unlimited + copy |
| Custom categories | Cap (~10) | Unlimited | Unlimited |
| Reports | This month + **1** previous | Full history | Full history |
| Forecast (expected in/out) | Basic this month | Full | Full + extras when built |
| CSV export (personal / household) | No | Yes | Yes |
| PDF export / report packs | No | No | Yes |
| Household | **1** group, **≤3** members, **1** ongoing ledger, **no** event ledgers | Full (events, close-event, more members, CSV) | Same as Plus |
| People (lend/borrow links) | **1** linked person | Unlimited | Unlimited |
| Themes / appearance | Default only | All themes | All themes |
| Home-screen widgets (extra) | Basic / none | Unlocked | Unlocked |
| Bank SMS / notification **paste or share** (manual) | Limited taste (e.g. **15** lifetime approvals) | Higher cap (e.g. **80**/month) | Unlimited / generous |
| Always-on SMS / notification **inbox** + auto-detect queue | No | No | **Yes** (Android where OS/policy allow) |
| Wallet aliases, kind overrides, transfer type, smart matching | Basic / manual | Manual + remember on approve | Full inbox + rules |
| Travel Mode (foreign amount + home books) | No (or short trial) | No | **Yes** |
| Future open-banking / statement file import | No | No | Pro, **region-gated** when live |
| Ads (AdMob non-money placements) | Yes | **No** | **No** |
| Support | Standard | Standard+ | Priority |
| Logged-in devices | **2** | **5** | **8** (reasonable cap) |
| Trial | — | 7 days | 7–14 days |

### 3.2 Free — “Follow every rupee”

**Must feel like a real app**, not a demo.

**Included**

- Up to **2** personal wallets (e.g. 1 bank + 1 cash).
- Unlimited manual transactions.
- Income, bills/loans, budgets with **small caps** (see table).
- Dashboard, basic forecast, privacy, reminders.
- **1** Household (ongoing only, ≤3 members) and **1** People link — growth features stay free at entry.
- Manual paste/share of a bank SMS **with a lifetime approval cap** (taste of automation).

**Not included**

- 3rd wallet, unlimited budgets, Household event ledgers, CSV/PDF, themes pack, no-ads, always-on import inbox, Travel Mode.

### 3.3 Plus — “Household & clarity”

**Everything in Free**, plus:

- Unlimited wallets, incomes, bills, budgets, categories.
- Full report history + **CSV** export.
- Full Household (event ledgers, more members) + unlimited People links.
- All themes, extra widgets, **no ads**.
- Higher manual import caps (still **no** always-on SMS/notification listener).

**Not included (Pro-only)**

- Always-on bank SMS / notification auto-inbox.
- Travel Mode.
- PDF packs / advanced exports.
- Future bank-aggregator sync / AI receipt scan (when built).

### 3.4 Pro — “Automation”

**Everything in Plus**, plus:

- Android SMS and/or notification listener → pending inbox → approve (web can review the **same** queue).
- Unlimited / generous import approvals, aliases, kind overrides, transfer detection.
- Travel Mode.
- PDF export and priority support.
- Early access to paid betas; later **region-gated** bank sync.

### 3.5 What never goes behind a paywall

- Creating an account / deleting an account.
- Privacy / biometric / PIN / screenshot protection.
- Correct balances and the ability to add a normal transaction.
- Legal personal-data export (GDPR-style), distinct from fancy PDF reports.
- Security patches and choosing country / currency.

---

## 4. How packages work for the user (product flow)

```
Sign up → Free (default)
     │
     ├─ Hits a Free limit (3rd wallet, event ledger, ads, …)
     │     → Upgrade sheet → Plus or Pro
     │
     └─ Wants SMS auto-inbox / Travel / PDF
           → Upgrade sheet → Pro (or try Pro trial)
```

**Checkout**

- Android: Google Play Billing (subscriptions monthly/yearly; optional lifetime promo).
- Web: either “Buy on Android” deep link, or a later web checkout that writes the **same** entitlement on the server (do not invent a second entitlement system).

**After purchase**

1. Play returns a purchase token.  
2. App calls `POST /api/premium/verify/` (already exists).  
3. Backend creates/updates `Entitlement` as **active**.  
4. App refreshes `GET /api/premium/` (or ops config that includes premium summary).  
5. UI unlocks features; ads hide for Plus/Pro.

**Restore purchases** — required by Play: same verify path on “Restore” in Settings.

---

## 5. How we enforce packages (so Free ≠ Plus ≠ Pro)

Enforcement must be **three layers**. UI alone is not enough.

### 5.1 Layer A — Entitlement model (source of truth)

Today the backend is roughly **binary**: `user_is_premium()` → Free vs “paid” (`premium_monthly` / `yearly` / `lifetime`).

To support three packages, evolve to a **plan rank**:

| Plan | Rank | Example product IDs |
| --- | --- | --- |
| `free` | 0 | (none) |
| `plus` | 1 | `plus_monthly`, `plus_yearly`, `plus_lifetime` |
| `pro` | 2 | `pro_monthly`, `pro_yearly`, `pro_lifetime` *(or keep `premium_*` as Pro)* |

**Helpers (proposed)**

```text
get_user_plan(user) -> "free" | "plus" | "pro"
plan_at_least(user, "plus") -> bool   # Plus or Pro
plan_at_least(user, "pro")  -> bool   # Pro only
```

Rules:

- Only **one live entitlement** per user (active, not expired).  
- Buying Pro while on Plus: upgrade entitlement (revoke/supersede Plus).  
- Expiry / cancel: drop to Free (or to Plus if they still hold a lower active sub — rare with Play; usually one sub).  
- Staff grant / promo codes must set **explicit plan** (`plus` or `pro`), not a vague “premium” flag.

### 5.2 Layer B — Feature catalog (single map)

Define every gated capability once, shared by web + mobile + API:

```text
FEATURE_GATES = {
  "wallet.create_beyond_free_cap": "plus",
  "budget.unlimited": "plus",
  "household.event_ledger": "plus",
  "export.csv": "plus",
  "ads.hide": "plus",
  "import.manual_high_cap": "plus",
  "import.auto_inbox": "pro",
  "travel.mode": "pro",
  "export.pdf": "pro",
  "import.aggregator": "pro",   # future
}
```

Clients call `canUse("travel.mode")`.  
API calls `require_plan(user, "pro")` before creating travel sessions or starting SMS auto-ingest.

### 5.3 Layer C — Soft caps vs hard features

| Type | Example | Enforcement |
| --- | --- | --- |
| **Count caps** | Free max 2 wallets | On create: if count ≥ limit and plan is Free → `403` + `{ code: "upgrade_required", plan: "plus", limit: 2 }` |
| **Feature flags** | Travel Mode | On enter / create: require Pro |
| **Usage meters** | Free 15 SMS approvals lifetime | Increment on approve; reject when over |
| **Ads** | Banner | Client + `premium_hides_ads`; treat Plus/Pro as hide |

### 5.4 Where to block (checklist)

| Surface | Free blocked from | Plus blocked from |
| --- | --- | --- |
| **API** (must) | Creating 3rd wallet; event ledger; CSV/PDF endpoints; auto SMS ingest; Travel create; high import caps | Travel; auto inbox; PDF; Pro-only betas |
| **Mobile UI** | Hide or lock with upgrade sheet | Same for Pro-only screens |
| **Web UI** | Same | Same |
| **Background jobs** | Do not start SMS listener / auto-approve for Free/Plus | SMS listener only if `plan_at_least(pro)` |
| **Admin / promo** | Grant only intended plan | Cannot “accidentally” grant Pro via Plus promo |

**Never trust the client** for: wallet create, household event create, export download, bank-sms auto ingest, travel session create, device-count registration.

### 5.5 Example API responses

When a Free user tries a Plus feature:

```json
{
  "detail": "This feature requires WalletTrails Plus.",
  "code": "upgrade_required",
  "required_plan": "plus",
  "current_plan": "free",
  "feature": "wallet.create_beyond_free_cap"
}
```

When a Plus user tries a Pro feature:

```json
{
  "detail": "This feature requires WalletTrails Pro.",
  "code": "upgrade_required",
  "required_plan": "pro",
  "current_plan": "plus",
  "feature": "import.auto_inbox"
}
```

UI maps `required_plan` → paywall screen with the correct SKUs.

### 5.6 Offline / local mobile note

Offline SQLite can still **queue** personal txs. Caps that need server counts (wallets, Household) should:

1. Allow optimistic UI carefully, **or**  
2. Check last-known plan + counts from cache, and **reject on sync** if over limit with a clear “Upgrade or delete a wallet” message.

Do **not** run Pro-only SMS auto-ingest offline without a cached Pro entitlement that has not expired.

---

## 6. How we create the packages (billing + backend)

### 6.1 Google Play Console (Android)

Create **subscription groups** (recommended: one group so users can upgrade Plus ↔ Pro without double-billing chaos):

| Product ID (suggested) | Plan | Period |
| --- | --- | --- |
| `plus_monthly` | Plus | 1 month |
| `plus_yearly` | Plus | 1 year |
| `pro_monthly` | Pro | 1 month |
| `pro_yearly` | Pro | 1 year |
| `plus_lifetime` / `pro_lifetime` | Optional promo | One-time |

Enable **7-day free trial** on paid base plans.  
Set **regional prices** from a USD list (see revenue doc).  
Base plans + offers live in Play Console; app only knows product IDs.

**Migration from current code:** today SKUs are `premium_monthly` / `premium_yearly` / `premium_lifetime`. Options:

1. **Map existing `premium_*` → Pro** and **add** `plus_*` (fastest).  
2. Rename everything to `pro_*` and migrate old purchases via Play + server alias table.

### 6.2 Backend changes (conceptual)

Already present:

- `Entitlement` model, Play verify (`/api/premium/verify/`), me endpoint, staff grant, promo redeem, ads config with `premium_hides_ads`.

Add / change:

1. **Plan field or product→plan map** (`plus_*` → plus, `premium_*`/`pro_*` → pro).  
2. Replace binary `is_premium` in client summaries with:

   ```json
   {
     "plan": "plus",
     "is_paid": true,
     "product_id": "plus_yearly",
     "expires_at": "...",
     "features": { "ads.hide": true, "travel.mode": false, ... }
   }
   ```

3. **Gate middleware / helpers** on create/list endpoints that enforce caps.  
4. **Usage counters** table or fields (e.g. `bank_sms_approvals_lifetime`, `bank_sms_approvals_month`).  
5. Ops admin: grant **Plus** or **Pro** explicitly; stats by plan.

### 6.3 Client changes (mobile + web)

1. Fetch plan on login / app start; cache with expiry.  
2. Central `usePlan()` / `canUse(feature)`.  
3. Upgrade sheet component (shared copy).  
4. Settings → “WalletTrails Plus / Pro” with buy, restore, manage subscription (Play deep link).  
5. Ad banner: show only if `plan === "free"` and ops allow ads.  
6. Bank SMS screen: Free/Plus = paste path only; Pro = enable listener + inbox.

### 6.4 Web without Play Billing (phase)

Until web checkout exists:

- Show pricing + “Subscribe on the Android app” + QR / store link.  
- Entitlement still lives on the user account, so web unlocks after they buy on Android and refresh session.

---

## 7. Suggested build order

| Phase | Work | Outcome |
| --- | --- | --- |
| **0** | Finalize matrix in this doc; name Pro vs Premium in UI | Product agreement |
| **1** | Backend `plan` + feature map + API 403s for **wallet cap** + **ads hide for any paid** | Soft launch of Plus value |
| **2** | Play SKUs Plus + Pro; verify maps to plan; Settings paywall | Users can buy |
| **3** | Gate Household events, CSV, themes | Plus conversion |
| **4** | Gate Travel + SMS auto-inbox + PDF as Pro | Pro conversion |
| **5** | Usage meters, trials, promo → plan, ops dashboards | Ops-ready |

Do **not** turn on hard caps in production until Play products and upgrade UX are live (otherwise Free users hit walls with no buy path).

---

## 8. Testing matrix (acceptance)

| Actor | Action | Expected |
| --- | --- | --- |
| Free | Create 3rd wallet | Blocked → upgrade to Plus |
| Free | Open Travel Mode | Blocked → upgrade to Pro |
| Free | Start SMS auto listener | Blocked |
| Free | See ads (allowed screens) | Ads may show |
| Plus | Create unlimited wallets | OK |
| Plus | Household event ledger | OK |
| Plus | CSV export | OK |
| Plus | Travel / SMS auto inbox / PDF | Blocked → upgrade to Pro |
| Plus | Ads | Hidden |
| Pro | All Plus features | OK |
| Pro | SMS inbox + Travel + PDF | OK |
| Pro | Ads | Hidden |
| Expired Pro | Any Pro/Plus gated action | Treated as Free |
| Tampered client calling Pro API as Free | API 403 | Server still blocks |

---

## 9. Pricing (summary only)

Full international pricing lives in `docs/REVENUE_AND_LAUNCH_RESEARCH.md`. Starting USD list (marketing):

| Plan | Monthly | Yearly |
| --- | --- | --- |
| Free | $0 | — |
| Plus | ~$1.99 | ~$14.99 |
| Pro | ~$4.99–$5.99 | ~$34.99–$35.99 |

Play regional pricing applies; website copy: “Prices vary by country and tax.”

---

## 10. Decision summary

| Question | Answer |
| --- | --- |
| How many packages? | **Three:** Free, Plus, Pro |
| What does Free get? | Real tracker + small caps + entry Household/People |
| What does Plus unlock? | Unlimited organization, Household power, CSV, no ads |
| What does Pro unlock? | Automation (SMS inbox), Travel, PDF, future bank sync |
| How do we stop Free from using Plus/Pro? | **Server plan rank + feature gates + caps**; UI is secondary |
| How do we stop Plus from using Pro? | Same gates with `required_plan: "pro"` |
| How do users get a package? | Play Billing → verify → `Entitlement` → clients refresh plan |
| Existing code? | Binary premium today → extend to **plan ranks** and **Plus SKUs** |

---

## 11. Open questions (resolve before coding Phase 2)

1. Public name: **Pro** or keep **Premium** everywhere?  
2. Exact Free caps (2 wallets / 3 bills / 15 SMS approvals) — confirm numbers.  
3. Is Travel Mode Pro-only (recommended) or Plus?  
4. Lifetime SKUs: Plus only, Pro only, or neither at launch?  
5. Does one Household payer unlock Plus for members (“family plan”), or each member pays?  

When these are decided, implementation can follow §7 without re-litigating the matrix.
