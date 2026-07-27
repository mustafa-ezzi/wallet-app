# PostHog for CashTrail (`posthawk.md`)

> **Note:** The product is **[PostHog](https://posthog.com)** (often typed “PostHawk”). This doc covers using PostHog in CashTrail (My-Wallet) — Django + React/Vite PWA on Railway.

---

## What PostHog is

PostHog is an **all-in-one product platform** for understanding how people use your app and shipping safer changes. Core pieces:

| Product | What it does |
| --- | --- |
| **Product analytics** | Events, funnels, retention, paths, trends |
| **Session replay** | Watch real sessions (clicks, navigation, errors) |
| **Feature flags** | Turn features on/off per user or % rollout |
| **Experiments (A/B)** | Test UI/copy/flows with statistical results |
| **Error tracking** | Capture frontend/backend exceptions in context |
| **Surveys** | In-app feedback (“Was split equal clear?”) |
| **Web analytics** | Page views / traffic (marketing site + app) |

Cloud-hosted or **self-hosted** (open source). Usage-based pricing with a large free tier (events, recordings, flags).

---

## Why it fits CashTrail

CashTrail has complex flows that are hard to judge from support messages alone:

- Personal wallets vs **Household** shared books  
- Dual-link expenses (bank + household)  
- Event ledgers, pot contributions, Split equal  
- PWA install / update behavior  
- Invite → preview → Accept  

PostHog answers: *Where do people drop off? Which features are used? What broke after deploy?*

---

## Pros of using PostHog

1. **One tool instead of many** — analytics + replay + flags + experiments + errors, so you don’t glue Mixpanel + Hotjar + LaunchDarkly + Sentry-lite separately.
2. **Generous free tier** — practical for an early finance PWA before you pay for volume.
3. **Open source / self-host option** — useful if you later need stricter data residency for PK/finance users (still treat money data carefully either way).
4. **Feature flags for risky rollouts** — e.g. ship Household Phase features to 10% of users first.
5. **Session replay for UX bugs** — “invite QR / pot / close ledger” issues are easier to reproduce when you can watch the session.
6. **Funnels matched to your product** — measure real CashTrail journeys, not vanity pageviews.
7. **Autocapture + custom events** — quick start with autocapture; precise events for money flows.
8. **Works well with React SPAs / PWAs** — first-party JS SDK; identify logged-in users after JWT login.
9. **SQL / warehouse mindset** — deeper questions later without leaving the product.
10. **Privacy controls** — mask inputs, block sensitive fields (critical for balances, amounts, invite codes).

### Honest trade-offs

- **Not a bank ledger** — PostHog is product telemetry, not your source of truth for PKR balances.  
- **Must scrub PII** — never send full account numbers, raw balances as unrestricted properties, or invite tokens in clear event props if avoidable.  
- **Event volume grows** — autocapture everything can get noisy/expensive; prefer a small curated event list.  
- **Compliance** — finance apps should document analytics in privacy policy and prefer masking + opt-out if required.

---

## Typical usage in CashTrail

### 1. Install (frontend)

```bash
cd frontend
npm install posthog-js
```

Init once after app load (e.g. in `main.tsx` or Auth bootstrap):

```ts
import posthog from 'posthog-js'

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST, // e.g. https://us.i.posthog.com
  person_profiles: 'identified_only',
  capture_pageview: true,
  capture_pageleave: true,
  session_recording: {
    maskAllInputs: true,           // important for finance forms
    maskTextSelector: '.amt-negative, .amt-positive, .stat-value',
  },
})
```

Env on Railway / Vite:

```env
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

### 2. Identify users after login

```ts
// after successful login / me()
posthog.identify(String(user.id), {
  email: user.email,          // optional — weigh privacy
  name: `${user.first_name} ${user.last_name}`.trim(),
})
```

On logout:

```ts
posthog.reset()
```

### 3. Capture product events (recommended set)

Keep events **stable and sparse**. Suggested CashTrail events:

| Event | When | Useful properties (non-sensitive) |
| --- | --- | --- |
| `user_signed_up` | Register success | `source` |
| `user_logged_in` | Login success | — |
| `wallet_created` | New account | `account_type` (`bank`/`cash`) |
| `transaction_created` | FAB add money | `tx_type`, `has_household_link` |
| `household_created` | Create household | — |
| `household_joined` | Accept invite | `via` (`code`/`email`) |
| `household_invite_shared` | Copy/WhatsApp invite | `channel` (`copy`/`whatsapp`/`qr`) |
| `household_expense_added` | Shared expense | `used_pot`, `has_wallet_link` |
| `household_pot_contributed` | Pot contribution | `has_wallet_link` |
| `household_ledger_closed` | Close & lock | `kind` (`ongoing`/`event`) |
| `household_split_equal_viewed` | Open Split equal | — |
| `pwa_installed` | Install prompt accepted | — |
| `report_exported` | CSV/PDF | `format`, `scope` (`personal`/`household`) |

Example:

```ts
posthog.capture('household_expense_added', {
  used_pot: potAmount > 0,
  has_wallet_link: Boolean(linkedAccountId),
  // Do NOT send: amount, account name, invite code, full notes
})
```

### 4. Funnels worth building first

1. **Household adoption**  
   `household_created` → `household_invite_shared` → `household_joined` → `household_expense_added`
2. **Dual-link success**  
   `transaction_created` (with `has_household_link=true`) vs household-hub add
3. **Event trip loop**  
   create event ledger → contribute → expense → close → split equal
4. **Activation**  
   signup → create wallet → first transaction

### 5. Feature flags (examples)

| Flag | Use |
| --- | --- |
| `household_v1` | Gate Household nav for beta users |
| `pot_spend_enabled` | Roll out “use from pot” gradually |
| `new_reports_export` | Test export UX |
| `force_pwa_update_prompt` | Control update dialog experiments |

```ts
if (posthog.isFeatureEnabled('pot_spend_enabled')) {
  // show Use from pot UI
}
```

### 6. Session replay hygiene (finance)

- Mask amount fields and balance UI.  
- Disable recording on auth screens if needed.  
- Never record clipboard invite codes in clear text properties.  
- Prefer `identify` by internal user id, not national ID / phone.

### 7. Optional backend (Django)

For server-side events (invite email sent, settlement marked):

```bash
pip install posthog
```

```python
from posthog import Posthog
posthog = Posthog('<phc_...>', host='https://us.i.posthog.com')
posthog.capture(str(user.id), 'household_invite_email_sent')
```

Use sparingly — most UX signal is frontend.

---

## Suggested rollout for CashTrail

| Step | Action | Status |
| --- | --- | --- |
| 1 | Create PostHog project; add `VITE_POSTHOG_*` env | **You do this** (see below) |
| 2 | Init SDK + identify/reset on auth | **Done** (`frontend/src/lib/analytics.ts`, `AuthContext`) |
| 3 | Curated product events (no raw amounts) | **Done** (signup, login, wallet, txs, household, PWA, reports) |
| 4 | Session replay with input/amount masking | **Done** in init config |
| 5 | Build Household adoption funnel dashboard | **You do this** in PostHog UI |
| 6 | Wrap new risky UI behind a feature flag | Optional next |
| 7 | Privacy policy / analytics note | Optional next |

---

## How to create & use PostHog (you)

### 1. Create a free project

1. Go to [https://posthog.com](https://posthog.com) → **Sign up** (or log in).  
2. Create a project (e.g. `CashTrail`).  
3. Open **Project settings** → **Project API key** (starts with `phc_…`).  
4. Note your **API host**:
   - US cloud: `https://us.i.posthog.com`
   - EU cloud: `https://eu.i.posthog.com`  
   Use the host shown in your PostHog onboarding snippet.

### 2. Add keys locally

Copy `frontend/.env.example` → `frontend/.env` (or `.env.local`):

```env
VITE_POSTHOG_KEY=phc_xxxxxxxx
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Restart Vite (`npm run dev`). **Without the key, analytics is silently disabled** — the app still works.

### 3. Add keys on Railway (production)

On the **frontend** Railway service → **Variables**:

| Variable | Value |
| --- | --- |
| `VITE_POSTHOG_KEY` | your `phc_…` key |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` (or EU host) |

Redeploy the frontend so Vite bakes the env into the build.

### 4. Verify events are arriving

1. Open your app, log in, create a wallet / add a transaction / open Household.  
2. In PostHog → **Activity** / **Live events** (or **Product analytics → Events**).  
3. You should see events like `user_logged_in`, `$pageview`, `transaction_created`, `household_created`, etc.  
4. Click a person → see their event timeline (identified by user id after login).

### 5. What to click in PostHog day-to-day

| Want to… | Go to |
| --- | --- |
| See live clicks / events | **Activity** / Live events |
| Count how often a feature is used | **Product analytics → Insights** → Trends on e.g. `household_expense_added` |
| Measure drop-off | **Insights → Funnel**: `household_created` → `household_invite_shared` → `household_joined` → `household_expense_added` |
| Watch a real session | **Session replay** (amounts/inputs are masked) |
| Roll out a feature slowly | **Feature flags** → create flag → check in code with `posthog.isFeatureEnabled(...)` |
| Catch frontend errors | **Error tracking** (optional enable in PostHog) |

### 6. Privacy reminder

CashTrail **does not** send amounts, invite codes, or full notes to PostHog — only flags like `tx_type`, `has_household_link`, `used_pot`, `channel`. Session replay masks inputs and balance CSS classes.

---

## What success looks like

You can answer, without guessing:

- How many users create a household vs only personal wallets?  
- Where invite sharing fails (copy vs WhatsApp vs QR)?  
- Do people use pot spend, or only contributions?  
- Does Split equal get opened after close?  
- Did a deploy drop “add expense” conversion?  
- Which sessions hit the 405 / empty states?

---

## Bottom line

**Use PostHog** if you want product clarity and safer rollouts for CashTrail’s household + PWA flows without buying a stack of separate tools.  

**Do not use it** as a financial audit log — keep Django/SQLite (or Postgres) as the money source of truth, and send PostHog **behavior signals**, not full ledger dumps.

---

## Related question: auto bank sync (Meezan / NayaPay / etc.)

> “If I pay a subscription from Meezan or NayaPay, can CashTrail **automatically** add an expense and cut the wallet balance? If salary/income hits the bank, can it **automatically** add income?”

### Short answer

**Not via PostHog.** PostHog tracks *product usage* (clicks, funnels, flags). It does **not** connect to banks or move/see PKR in real time.

**As a CashTrail product feature:** full real-time auto-sync with Meezan, NayaPay, JazzCash, etc. is **not something you can ship like a normal API integration today** for a typical indie/consumer app in Pakistan — unless you get **official bank/fintech partnership**, join an **SBP open-banking / aggregator** program, or use a licensed data provider that already covers those rails.

Today CashTrail works the opposite way (and that’s correct for v1):

1. User records expense/income in the app **or**  
2. Dual-link: pick Meezan wallet in CashTrail → balance drops **inside CashTrail’s books**  

That is **manual / in-app**, not “bank told the app what happened.”

### Why “realtime from the bank” is hard in PK

| Reality | Meaning for CashTrail |
| --- | --- |
| No public “Plaid for every PK bank” you can just plug in | You can’t `npm install` Meezan webhooks and go live |
| Banks don’t push every card/subscription to random third-party apps | No secret feed of “Netflix deducted 2,000” |
| Access needs **customer consent + regulated channel** | Open finance / TPP / sandbox / commercial agreement |
| SBP is moving toward open banking / open finance | Future gets better; not a free consumer API today |
| Unofficial scraping of bank apps / SMS | Fragile, ToS/legal risk, breaks often — **avoid for production** |

So: **desirable feature, not a PostHog feature, and not freely available for Meezan/NayaPay out of the box.**

### What *is* possible (practical ladder for CashTrail)

#### A. Already possible (ship / polish now)

- Manual add expense/income (current)  
- Dual-link household + personal wallet (current)  
- **Import statement CSV/PDF** (user downloads from Meezan/NayaPay → CashTrail maps rows → creates txs)  
- **Recurring templates** (“Netflix ~2,000 on the 5th”) as *reminders* or auto-drafts the user confirms  

Pros: legal, reliable, no bank deal.  
Cons: not realtime; user still participates.

#### B. Near-realtime *approximations* (careful)

| Approach | How it works | Pros | Cons |
| --- | --- | --- | --- |
| **SMS / email parse (user opts in)** | User forwards bank SMS/email; server parses amount + merchant | Feels automatic | Fragile templates per bank; privacy; false matches |
| **Share-sheet / “Add from notification”** | User shares a bank alert into CashTrail | Simple UX | Still one tap; not fully auto |
| **Raast / payment links you initiate** | CashTrail starts a payment you complete in bank app, then marks paid | Good for *outgoing you control* | Doesn’t catch Netflix charged by the bank itself |

#### C. True bank sync (long-term / partnership)

| Path | What you need |
| --- | --- |
| **Official bank / wallet API** | Commercial agreement with Meezan, NayaPay, JazzCash, etc. |
| **Open banking aggregator / TPP** | Provider that normalizes PK banks under consent; you integrate once |
| **SBP open finance sandbox** | When frameworks mature, build as a regulated data user |

Then the flow becomes:

```
Bank transaction webhook / poll
  → match to user-linked CashTrail wallet (Meezan)
  → create Transaction (expense or income)
  → wallet balance updates in CashTrail
  → optional: suggest category / household link
```

Pros: true “subscription auto-expense / salary auto-income.”  
Cons: months of partnership/compliance, cost, limited bank coverage at first.

### Recommended product stance for CashTrail

1. **Don’t promise “live Meezan sync”** in marketing until a real feed exists.  
2. **Near term:** statement import + smart recurring suggestions + confirm UI.  
3. **Track demand with PostHog** (this *is* where PostHog helps):

   ```ts
   posthog.capture('bank_sync_interest_clicked', { bank: 'meezan' | 'nayapay' | 'other' })
   ```

   Funnel: how many users ask for auto-sync vs use CSV import.  
4. **Long term:** pursue open-finance / aggregator when ready; feature-flag `bank_sync_v1` behind PostHog flags for beta users.

### Bottom line on bank auto-cut / auto-add

| Goal | Possible now? |
| --- | --- |
| App balance drops when user logs expense in CashTrail | **Yes** (already) |
| App auto-creates expense when Meezan charges Netflix | **Not without bank/aggregator access** |
| App auto-adds salary when it hits NayaPay | **Same — needs official data feed** |
| PostHog does this | **No** — use PostHog only to measure if users want it and how import flows perform |

---

## References

- [PostHog docs](https://posthog.com/docs)  
- [JS / React install](https://posthog.com/docs/libraries/js)  
- [Python SDK](https://posthog.com/docs/libraries/python)  
- [Feature flags](https://posthog.com/docs/feature-flags)  
- [Session replay privacy](https://posthog.com/docs/session-replay/privacy)  
- SBP / Pakistan open banking direction — watch official SBP open finance updates before promising live bank sync  
