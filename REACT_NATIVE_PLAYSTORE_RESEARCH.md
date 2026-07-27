# Research: React Native App + Play Store (Biometrics, Alerts & Offline)

**Product:** CashTrail (My-Wallet)  
**Status:** Research / design proposal (not implemented)  
**Date:** 2026-07-27  
**Related:** `Monetization_Research.md` (revenue + Capacitor vs RN overview), `posthawk.md` (analytics), requirements + household docs  

**Goal:** Convert CashTrail into a **React Native** Android app, publish it on the **Google Play Store**, add **biometric unlock to reveal money amounts**, ship a **notification system** for loan (payable) due dates and money owed to you (receivables), and support **offline use** so the app still runs and can **store transactions locally** when there is no internet, then sync when back online.

---

## 1. Problem statement

Today CashTrail is a **React (Vite) PWA + Django REST** web app. Users can install it to the home screen, but:

| Gap | Why it matters |
| --- | --- |
| Not on Play Store | Harder discovery, trust, updates, reviews in Pakistan |
| Amounts always visible after login | Phone unlock ≠ finance privacy (shared phones / shoulder surfing) |
| No native due-date alerts | Loans you owe and installments clients owe you rely on opening the app |
| Web push is weak on Android vs FCM | Missed reminders for `due_day` payables / receivable schedules |
| Fully online-only | Spotty mobile data in PK / travel → can’t log a spend in the moment |

**Desired outcome:**

1. CashTrail as a real Android app (`com.cashtrail.app` or similar) on Play Store.  
2. After normal login (or session restore), **balances and amounts stay hidden** until the user passes **fingerprint / face / device credential**.  
3. Local + push notifications: “Loan X due in 2 days”, “Receivable from Client Y expected this week”.  
4. **Offline-capable:** open the app without network, see last synced wallets/txs, **add income/expense offline**, queue them, sync to Django when online.  
5. Same Django backend — no rewrite of core business logic.

---

## 2. Recommended approach (decision)

| Path | Effort | Fit for biometrics + reliable reminders | Verdict |
| --- | --- | --- | --- |
| **A. Capacitor wrap current React** | 1–2 weeks to store listing | Possible via plugins; still a WebView | Good **MVP / smoke test** |
| **B. React Native (Expo) rewrite of UI** | 6–12 weeks solid v1 | Best for biometrics, FCM, background | **Recommended for this research goal** |
| **C. Flutter rewrite** | Similar to B | Strong, but new language vs your TS stack | Skip unless team prefers Dart |

**Recommendation:** Use **Expo (React Native) + keep Django API**. Optionally ship a **Capacitor “CashTrail Lite”** first if you need a Play listing *this month*, then migrate to RN for biometrics/notifications quality.

Reuse from current app:

- `frontend/src/api/client.ts` patterns (Axios / fetch + JWT)  
- TypeScript domain types (Account, Transaction, Payable, Receivable, Household)  
- All backend endpoints unchanged  
- PostHog via `posthog-react-native` (optional, parallel to web)

Rewrite: screens, navigation, StyleSheet / NativeWind UI, secure storage, notification scheduling.

---

## 3. Target architecture

```
┌─────────────────────────────────────────┐
│  React Native (Expo) — Android (iOS later)
│  • Auth (JWT in SecureStore)
│  • Biometric gate (amounts / sensitive screens)
│  • Local notifications + FCM push
│  • Offline SQLite mirror + transaction outbox
│  • Optional encrypted local cache
└──────────────────┬──────────────────────┘
                   │ HTTPS JWT (when online)
┌──────────────────▼──────────────────────┐
│  Django REST (Railway) — unchanged core │
│  • wallets, txs, payables, receivables  │
│  • household APIs                       │
│  • NEW: device tokens + reminder rules  │
│  • NEW: client_mutation_id (offline sync)│
└─────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Firebase Cloud Messaging (FCM)         │
│  optional: Expo Push / OneSignal        │
└─────────────────────────────────────────┘
```

**Package id (suggested):** `com.cashtrail.app`  
**App name:** CashTrail  
**Min SDK:** Android 8+ (API 26) for broad PK device coverage; biometrics via AndroidX Biometric.

---

## 4. Feature: Biometric verification to see amounts

### 4.1 Product behavior (recommended UX)

Do **not** replace login with biometrics alone (lost phone = anyone with fingerprint opens finances if you only gate the app). Prefer **two layers**:

| Layer | Purpose |
| --- | --- |
| **1. Account auth** | Email/password → JWT (same as today). Stored in **Expo SecureStore** / Keystore. |
| **2. Privacy lock** | After open / resume, **mask all amounts** until biometric (or PIN) succeeds. |

**User settings:**

- `privacy_lock_enabled` (default **on** for new mobile installs)  
- `lock_timeout_seconds` (e.g. 60 / 300 / immediately on background)  
- Fallback: device PIN / pattern / CashTrail app PIN if biometrics unavailable  

**Masked UI examples:**

- Dashboard balances → `••••` or `PKR ••••`  
- Transaction rows → hide amount column  
- Reports / forecast totals → blurred or dots  
- Household pot / split figures → same rule  

Optional: toggle “Show amounts” that triggers `LocalAuthentication.authenticateAsync()` then reveals until timeout.

### 4.2 Technical options (Expo / RN)

| Library | Role |
| --- | --- |
| `expo-local-authentication` | Fingerprint / Face / Iris / device credential |
| `expo-secure-store` | JWT + app PIN hash |
| `expo-app-state` / focus events | Re-lock on background |
| Optional: `react-native-vision-camera` | **Not needed** for standard biometrics |

Flow:

```
App foreground
  → if privacy_lock_enabled && locked
      → show LockScreen (logo + “Unlock with fingerprint”)
      → LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock CashTrail amounts',
            fallbackLabel: 'Use PIN',
            disableDeviceFallback: false,
          })
      → success → setUnlockedUntil = now + timeout
  → screens read `amountsVisible` from PrivacyLockContext
```

### 4.3 Security notes (finance app)

- Biometrics prove **device owner**, not CashTrail identity — still require JWT for API.  
- Never store plaintext passwords.  
- Mask amounts in **screenshots** if possible (`FLAG_SECURE` on Android for sensitive screens — Expo / RN modules exist).  
- Session replay (PostHog) must keep amount masking on mobile too.  
- Play policy: disclose biometric use in Data safety / privacy policy.

### 4.4 Out of scope for v1

- Server-side “biometric templates” (never upload fingerprints).  
- Replacing password login entirely.  
- Hardware wallet / TEE custom crypto beyond OS Keystore.

---

## 5. Feature: Notifications for loans & money owed to you

### 5.1 What to alert (mapped to current models)

| Source in CashTrail today | Model / fields | Alert idea |
| --- | --- | --- |
| **Loans you owe** | `PayableInstallment` — `due_day`, `monthly_amount`, `status`, remaining | “{name} installment due on day {due_day} — PKR … (or masked)” |
| **Money owed to you** | `ReceivableInstallment` — schedule via `start_date` + installment count / monthly | “Expect installment from {project} around {date}” |
| **One-time expenses with due** | `Expense.due_day` if used | Optional bill reminder |
| **Household** (later) | Event close dates, settlement | Optional Phase 2 |

**Suggested reminder schedule (user-configurable):**

- 3 days before  
- 1 day before  
- On the due day (morning, local timezone Asia/Karachi default)  
- Optional overdue nudge (+1 / +3 days if still unpaid)

### 5.2 Two delivery channels

| Channel | When to use | Pros | Cons |
| --- | --- | --- | --- |
| **A. Local notifications** | Scheduled on-device from cached payable/receivable list | Works offline; simple with `expo-notifications` | Missed if user never opens app to refresh schedule; timezone changes |
| **B. Server push (FCM)** | Django cron / Celery Beat computes due items → push | Reliable even if app unused for weeks | Needs device token API + FCM setup + backend job |

**Recommendation:** **Both**

1. **v1:** Local notifications refreshed whenever the app syncs Expenses / payables / receivables.  
2. **v1.1:** Backend daily job + FCM for users who granted notification permission and registered a device token.

### 5.3 Client (Expo) sketch

```ts
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

// After login + permission
const token = (await Notifications.getExpoPushTokenAsync()).data
await api.post('/devices/', { token, platform: 'android' })

// Reschedule locals when payables load
await Notifications.cancelAllScheduledNotificationsAsync()
for (const payable of activePayables) {
  for (const fireDate of computeReminderDates(payable, prefs)) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Loan reminder',
        body: `${payable.name} due soon`, // avoid amount in lock-screen if privacy on
        data: { type: 'payable', id: payable.id },
      },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireDate },
    })
  }
}
```

**Privacy:** If privacy lock is on, notification body should **not** include exact PKR amounts (or use “an installment is due”) so lock-screen peeks don’t leak money.

### 5.4 Backend additions (minimal)

New models / endpoints:

```
DeviceToken
  user FK
  token string (unique)
  platform enum android|ios
  updated_at

NotificationPreference (optional)
  user OneToOne
  remind_days_before = [3, 1, 0]
  receivables_enabled bool
  payables_enabled bool
  quiet_hours_start / end
```

Endpoints:

- `POST /api/devices/` — register / rotate FCM or Expo push token  
- `DELETE /api/devices/{id}/` — logout / revoke  
- `GET/PATCH /api/notification-preferences/`  

Job (Railway cron or Celery):

```
Daily 01:00 Asia/Karachi
  for each active PayableInstallment / ReceivableInstallment
    if due within remind_days and not already notified today
      send Expo/FCM push to user's devices
```

### 5.5 Deep links

Tapping a notification opens:

- `cashtrail://expenses?tab=payables&id=…` or  
- `cashtrail://expenses?tab=receivables&id=…`  

Then require biometric before showing amounts if locked.

---

## 6. Offline mode — run the app & store transactions without internet

### 6.1 Why this matters for CashTrail

Pakistan mobile data drops often (travel, buildings, load-shedding adjacent issues). Users need to:

- Open CashTrail **without** hitting Railway  
- See **last known** wallets / recent transactions  
- **Record a spend or income immediately** (the “at least store transactions offline” requirement)  
- Have those rows **upload automatically** when the phone is back online  

Without this, the RN app is just a thin online client — worse UX than a notebook in airplane mode.

### 6.2 What “offline” means (scope levels)

| Level | What works offline | Effort | Verdict |
| --- | --- | --- | --- |
| **L0 — Cached read** | Last synced dashboard, wallets, recent txs (read-only) | Small | Baseline |
| **L1 — Offline write queue** | Create income/expense (and maybe transfers) locally → sync later | Medium | **Minimum for this research** |
| **L2 — Full offline ledger** | Edit/delete, payables mark-paid, household dual-link, conflict resolution | Large | Phase 2 |

**Ship L0 + L1 first.** Household shared edits and multi-device conflict handling can wait.

### 6.3 Recommended architecture (local DB + outbox)

```
┌──────────────────────────────────────────────┐
│  React Native UI                             │
│  reads/writes → local store (source of UI)   │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│  Local database (SQLite / WatermelonDB)      │
│  • accounts, transactions (synced mirror)    │
│  • outbox_queue (pending creates)            │
│  • meta: last_synced_at, user_id             │
└──────────────────┬───────────────────────────┘
                   │ when NetInfo = online
┌──────────────────▼───────────────────────────┐
│  Sync engine                                 │
│  1. PUSH outbox → POST /api/transactions/    │
│  2. PULL lists → upsert into local DB        │
│  3. Recompute local balances / mark synced   │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│  Django REST (source of truth when online)   │
└──────────────────────────────────────────────┘
```

**Rule:** UI never waits on the network for “Add expense.” It writes local + outbox instantly; sync is background.

### 6.4 Storage choices (Expo / RN)

| Option | Pros | Cons | Use when |
| --- | --- | --- | --- |
| **`expo-sqlite`** | Official, simple SQL, good enough for personal finance volume | You write sync/outbox yourself | **Recommended default** |
| **WatermelonDB** | Built for offline-first, lazy load, sync primitives | Heavier learning curve | If you want L2 soon |
| **MMKV / AsyncStorage** | Tiny key-value | Bad for queryable tx lists / joins | Cache flags only, not the ledger |
| **PowerSync / ElectricSQL** | Hosted sync to Postgres | Extra cost/ops; Django not native | Overkill for v1 |

**Recommendation:** `expo-sqlite` + a small TypeScript sync module. Encrypt DB at rest if feasible (`SQLCipher` / secure filesystem) because it holds amounts — still gate UI with biometrics.

Also keep JWT in `expo-secure-store` (not SQLite).

### 6.5 Local schema (minimal)

```sql
-- Mirror of server rows (server_id nullable until synced)
CREATE TABLE accounts (
  local_id TEXT PRIMARY KEY,
  server_id INTEGER,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  opening_balance REAL NOT NULL,
  current_balance REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE transactions (
  local_id TEXT PRIMARY KEY,          -- uuid generated on device
  server_id INTEGER,                  -- set after successful POST
  sync_status TEXT NOT NULL,          -- 'synced' | 'pending' | 'failed'
  type TEXT NOT NULL,                 -- income | expense
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  account_local_id TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  client_mutation_id TEXT UNIQUE       -- idempotency key for Django
);

CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,               -- 'transaction'
  local_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

On successful first login / pull: hydrate `accounts` + recent `transactions` from API.

### 6.6 Offline add-transaction flow

```
User taps Save (offline or online)
  → generate local_id = uuid()
  → generate client_mutation_id = uuid()
  → INSERT transaction sync_status='pending'
  → UPDATE account.current_balance locally (± amount)
  → INSERT outbox row
  → UI shows tx with “Pending sync” badge
  → if online: run syncNow(); else wait for NetInfo

When online:
  → POST /api/transactions/ with client_mutation_id
  → on 201: set server_id, sync_status='synced', delete outbox
  → on conflict/duplicate idempotency: treat as success
  → on 4xx validation: mark failed, keep row, show “Fix & retry”
  → on 5xx/network: bump attempts, retry with backoff
```

**Optimistic balances:** Local balance updates immediately so Dashboard feels live. After pull, reconcile with server `current_balance` (server wins if they diverge after sync).

### 6.7 Backend support for safe sync (small Django additions)

Today `POST /api/transactions/` works online-only. For reliable offline uploads, add:

| Addition | Why |
| --- | --- |
| `client_mutation_id` (unique per user) on Transaction | Same offline retry must not create duplicate spends |
| Optional `updated_since` list filter | Cheaper incremental pull |
| Clear error codes for “account not found” | Device may have stale wallet |

Idempotent create sketch:

```python
# If client_mutation_id already exists for this user → return existing tx (200/201)
```

Without idempotency, flaky networks create **double expenses** — unacceptable for a wallet app.

### 6.8 What works vs what stays online-only (v1)

| Action | Offline v1 |
| --- | --- |
| Open app (after prior login) | Yes — JWT in SecureStore + local DB |
| View wallets / balances (last sync) | Yes |
| View recent transactions | Yes |
| **Add income / expense** | **Yes — queued** |
| Transfer between wallets | Optional same outbox pattern |
| Edit / delete transaction | Online only (or L2) |
| Create wallet | Online only (need server id) — or queue as L1.1 |
| Login / signup first time | Needs network |
| Household expense / pot / invite | Online only (multi-user conflicts) |
| Reports export / forecast refresh | Cached last forecast OK; full recompute online |
| Sync / push notifications register | Needs network |

Show a clear **Offline** chip in the header when `NetInfo` is disconnected, and **N pending** when outbox length > 0.

### 6.9 Sync triggers

Run the sync engine when:

1. App becomes active **and** online  
2. `NetInfo` flips to connected  
3. User pulls to refresh  
4. After every successful local write (if online)  
5. Periodic background fetch (optional — limited on Android unless high-priority; don’t rely on it alone)

Use `@react-native-community/netinfo` (Expo-compatible).

### 6.10 Multi-device & conflicts (honest limits)

If the same user logs CashTrail on phone + web:

- Offline phone creates −500 food  
- Web creates −200 utilities  
- Both sync → both should appear (two creates) — fine with idempotency ids  

Hard cases (defer to L2):

- Offline edit of same server tx on two devices  
- Offline expense against a wallet deleted on web  
- Household dual-link while another member edits pot  

**v1 policy:** personal income/expense creates only; on pull, **server list merges by `server_id`**; pending local rows stay until pushed.

### 6.11 Security & privacy offline

- Local DB holds real amounts → **biometric privacy lock still applies** to UI.  
- Prefer encrypting SQLite if shipping to shared/family phones.  
- On logout: wipe local DB + outbox + SecureStore tokens.  
- Don’t put pending tx amounts in clear lock-screen notifications.  
- Declare “financial info stored on device” in Play Data safety.

### 6.12 UX copy / empty & error states

- First install, never online → “Connect once to download your wallets.”  
- Offline with empty cache → block add until first sync (no account ids).  
- Pending badge: “Saved on this phone · waiting to sync.”  
- Sync failed validation: “Couldn’t sync — account missing. Open when online.”  

### 6.13 Implementation checklist (offline)

- [ ] `expo-sqlite` schema + migrations  
- [ ] Hydrate accounts/txs after login  
- [ ] Outbox + `client_mutation_id` on create  
- [ ] Django unique constraint + idempotent POST  
- [ ] NetInfo-driven sync engine + retry/backoff  
- [ ] Offline / Pending sync UI indicators  
- [ ] Logout wipes local ledger  
- [ ] PostHog: `transaction_queued_offline`, `transaction_sync_success`, `transaction_sync_failed` (no amounts)

### 6.14 Bottom line on offline

| Goal | Possible? |
| --- | --- |
| App opens with no internet | **Yes** (after at least one successful login/sync) |
| See last wallets & transactions | **Yes** (local mirror) |
| Store new transactions offline | **Yes** (outbox → sync later) |
| Full offline household + edits | Later (L2) |
| Zero backend changes | Risky — add idempotency to avoid duplicate txs |

---

## 7. React Native conversion plan

### 7.1 Stack suggestion

| Piece | Choice |
| --- | --- |
| Framework | **Expo SDK** (managed) + EAS Build |
| Language | TypeScript |
| Navigation | Expo Router or React Navigation |
| UI | NativeWind or custom StyleSheet matching CashTrail theme tokens |
| HTTP | Axios (port `client.ts`) |
| Auth storage | `expo-secure-store` |
| Biometrics | `expo-local-authentication` |
| Notifications | `expo-notifications` + FCM via EAS |
| Offline DB | **`expo-sqlite`** + outbox sync (WatermelonDB if going L2) |
| Network | `@react-native-community/netinfo` |
| Updates | EAS Update (optional OTA for JS) |
| Analytics | `posthog-react-native` |

### 7.2 Screen migration map

| Web (current) | RN screen | Priority |
| --- | --- | --- |
| Login / Signup | Auth stack | P0 |
| Dashboard | Home | P0 |
| Accounts / wallets | Wallets | P0 |
| FAB Add transaction | Modal / screen | P0 |
| Expenses (bills / payables / receivables) | Expenses + reminder hooks | P0 |
| Reports | Reports | P1 |
| Household | Household | P1 |
| Settings (+ privacy lock, notifications, offline status) | Settings | P0 |
| PWA install / update dialogs | Remove / replace with store updates | — |

### 7.3 Phased delivery

| Phase | Scope | Outcome |
| --- | --- | --- |
| **M0** | Expo app shell, auth, wallets list, add income/expense | Internal APK |
| **M1** | Privacy lock (biometrics), amount masking | Store-ready privacy story |
| **M2** | Offline cache + outbox for transactions (L0+L1) | App usable without data |
| **M3** | Local notifications for payables / receivables | Reminder MVP |
| **M4** | Device tokens + Django daily push | Reliable alerts |
| **M5** | Household + reports parity | Feature complete vs web |
| **M6** | Play Store listing, ASO, PostHog mobile | Public launch |

**Rough effort:** 1 experienced RN + your existing API → **~8–12 weeks** to M4 (incl. offline); Household parity may add **2–4 weeks**.

### 7.4 What not to do

- Don’t fork business rules into the mobile app — keep Django as source of truth **after sync**.  
- Don’t treat AsyncStorage as the ledger — use SQLite + outbox.  
- Don’t POST offline txs without **idempotency** (`client_mutation_id`).  
- Don’t embed PostHog amounts / invite codes (same rules as web).  
- Don’t ship debug `android:debuggable` or test AdMob IDs in production AAB.

---

## 8. How to publish on Google Play Store

### 8.1 One-time account setup

1. Create a **Google Play Console** account: [play.google.com/console](https://play.google.com/console)  
2. Pay the **one-time registration fee** (historically **USD $25** — confirm current fee at signup).  
3. Complete **Account details**, **payments profile** (for paid apps / IAP later — free app can still need a profile in some regions).  
4. Accept developer policies / D-U-N-S not required for personal accounts (organizations differ).

**Pakistan note:** Use a Google account you control long-term; verify Play Console access with a phone number that can receive SMS.

### 8.2 Create the app in Play Console

1. **Create app** → name `CashTrail`, default language English (add Urdu later).  
2. App type: **App**, Free (or Free with in-app products if monetizing — see `Monetization_Research.md`).  
3. Declarations: privacy policy URL, ads (yes/no), target audience, news app (no), COVID (no), Data safety form.

### 8.3 Build a Play-ready Android App Bundle (`.aab`)

With Expo EAS (recommended):

```bash
# In the new mobile repo / apps/mobile
npm i -g eas-cli
eas login
eas build:configure

# app.json / app.config.ts
# android.package = "com.cashtrail.app"
# version + versionCode

eas build --platform android --profile production
```

Download the `.aab` from Expo.  
Alternatively: `npx expo prebuild` → open Android Studio → **Build → Generate Signed Bundle**.

**Signing:** EAS can manage the upload key; store credentials safely. Play App Signing is mandatory — Google holds the app signing key.

### 8.4 Store listing assets (prepare before submit)

| Asset | Guidance |
| --- | --- |
| App icon | 512×512 PNG |
| Feature graphic | 1024×500 |
| Phone screenshots | ≥ 2 (dashboard masked + unlocked, expenses, forecast, offline pending badge) |
| Short description | ≤ 80 chars |
| Full description | Features, biometrics, reminders, offline logging, PKR / freelancers |
| Privacy policy | **Required** — hosted URL (GitHub Pages / your domain) |
| Category | Finance |
| Contact email | Support inbox |

### 8.5 Policy & compliance checklists (finance)

- **Data safety:** collect email? yes; financial info? yes (user-entered + **on-device cache**); biometrics? processed on-device only — declare correctly.  
- **Permissions:** `USE_BIOMETRIC` / `USE_FINGERPRINT`, `POST_NOTIFICATIONS` (Android 13+), Internet. Justify each.  
- **Privacy policy** must mention: accounts, JWT, optional push tokens, **offline ledger stored on device**, analytics (PostHog), no sale of ledger data.  
- **Content rating** questionnaire (IARC).  
- Target API level: meet Google’s **current targetSdk** requirement (update yearly).

### 8.6 Release tracks

| Track | Use |
| --- | --- |
| **Internal testing** | You + 1–10 testers, fastest |
| **Closed testing** | Friends / beta (required often before production for new personal accounts) |
| **Open testing** | Public beta |
| **Production** | Full Play Store |

New developer accounts often must complete **closed testing** (e.g. 12+ testers for ~14 days — **confirm current Google rules** at submit time; they change).

### 8.7 Submit flow (summary)

1. Upload `.aab` to a release track.  
2. Complete **Store listing**, **Data safety**, **Content rating**, **App access** (if login required: provide demo credentials for reviewers).  
3. **Countries:** start with Pakistan + others as needed.  
4. Review → address policy rejections (common: incomplete privacy, broken login for reviewer, misleading Finance claims).  
5. Roll out 20% → 100% after stability.

### 8.8 After publish

- Monitor **ANRs / crashes** in Play Console + optional Sentry.  
- Use **PostHog** funnels for mobile events (`privacy_unlock_success`, `reminder_tapped`, `transaction_queued_offline`).  
- Ship updates: bump `versionCode`, new EAS build, same listing.  
- **Play Store Optimization:** screenshots showing “Hide amounts with fingerprint”, “Loan due reminders”, and “Works offline”.

### 8.9 Cost snapshot (order of magnitude)

| Item | Approx. |
| --- | --- |
| Play Console registration | ~$25 once |
| Expo EAS free tier | Limited builds; paid if you ship often |
| Apple App Store (later) | ~$99/year — out of scope for this Android-first doc |
| FCM | Free at normal volume |

---

## 9. Capacitor alternative (if you need Play Store sooner)

From `Monetization_Research.md`: wrap the existing Vite app with Capacitor, add:

- `@capacitor-community/biometric-auth` or similar for unlock  
- `@capacitor/local-notifications` + `@capacitor/push-notifications`  
- `@capacitor/preferences` or SQLite plugin for a **lighter** offline cache (full outbox is harder in WebView than RN)

**Pros:** Reuse 90% UI.  
**Cons:** Biometric UX, background reliability, and offline sync are weaker than RN; WebView performance on low-end PK Androids varies.

**Pragmatic path:** Capacitor → closed test listing → parallel RN rewrite → replace listing package **only if** same `applicationId` / transfer carefully (usually one package id forever). Prefer **one package id** from day one (`com.cashtrail.app`) even if v1 is Capacitor.

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Play rejects Finance app | Clear privacy policy; no “bank sync” claims you can’t deliver; accurate Data safety |
| Reviewer can’t log in | Provide demo account in Play Console “App access” |
| Users deny notification permission | In-app banner explaining loan reminders; still show due badges in UI |
| Biometric fails on cheap devices | Device credential / app PIN fallback |
| Amounts leak in notifications | Mask amounts when privacy lock enabled |
| Offline duplicate transactions | `client_mutation_id` idempotency on Django |
| Stale offline balances vs web | Server wins on pull after outbox flush; show “Pending sync” |
| Dual web + mobile divergence | Shared API contract tests; feature flags |
| EAS / signing key loss | Backup credentials; Play App Signing enabled |

---

## 11. Success metrics

- Closed test → production approval without major policy rewrite  
- ≥ 70% of mobile users enable privacy lock  
- ≥ 50% grant notification permission  
- ≥ 80% of offline-queued txs sync successfully within 24h of reconnect  
- Measurable drop in “I forgot my loan due date” support themes  
- Reminder tap → open payable/receivable within 24h (PostHog funnel)

---

## 12. Suggested implementation checklist

### Product / design
- [ ] Lock screen mock (masked dashboard)  
- [ ] Settings: privacy timeout, notification lead days  
- [ ] Notification copy (with / without amounts)  
- [ ] Offline / Pending sync indicators

### Mobile
- [ ] Expo app + Expo Router  
- [ ] Port API client + auth  
- [ ] PrivacyLockContext + `expo-local-authentication`  
- [ ] `expo-sqlite` mirror + outbox for transactions  
- [ ] NetInfo sync engine  
- [ ] Schedule local notifications from payables/receivables  
- [ ] Register push token  
- [ ] `FLAG_SECURE` on sensitive screens (optional)

### Backend
- [ ] `client_mutation_id` idempotent transaction create  
- [ ] `DeviceToken` + preferences APIs  
- [ ] Daily reminder job (Railway cron)  
- [ ] Expo push or FCM send helper

### Play Store
- [ ] Play Console account + fee  
- [ ] Privacy policy page live (incl. on-device offline data)  
- [ ] Icons, screenshots, Data safety  
- [ ] Demo reviewer login  
- [ ] Internal → closed → production  
- [ ] EAS production `.aab` upload

---

## 13. Bottom line

| Question | Answer |
| --- | --- |
| Can we convert to React Native? | **Yes** — rewrite UI in Expo RN; **keep Django**. |
| Biometrics to see amounts? | **Yes** — privacy lock with `expo-local-authentication`; mask UI until unlock. |
| Alerts for loans & money owed? | **Yes** — local schedules first, then Django + FCM/Expo push. |
| Run & store txs offline? | **Yes** — SQLite mirror + outbox; sync when online (add Django idempotency). |
| Play Store publish? | **Yes** — Play Console + signed `.aab` (EAS) + listing, Data safety, testing tracks. |
| Fastest store presence? | Capacitor wrap; **best** biometrics/notifications/offline quality → **React Native**. |

**Next concrete step when you want to build:** scaffold `apps/mobile` with Expo, implement Auth + Privacy Lock + offline transaction outbox against the existing Railway API, then wire payable/receivable reminder scheduling before investing in full Household parity.

---

## References

- [Expo Local Authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)  
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)  
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)  
- [NetInfo](https://github.com/react-native-netinfo/react-native-netinfo)  
- [EAS Build](https://docs.expo.dev/build/introduction/)  
- [Google Play Console](https://play.google.com/console)  
- [Play policy — User data](https://support.google.com/googleplay/android-developer/answer/10144311)  
- Internal: `Monetization_Research.md` §1–2, `posthawk.md`, payable/receivable models in `backend/api/models.py`
