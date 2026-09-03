# Deploy WalletTrails to Google Play Console

Step-by-step guide for publishing the Expo Android app (`mobile/`) under **PowerPulse Labs**.

| Item | Value |
|------|--------|
| App name | WalletTrails |
| Package / application ID | `com.WalletTrails.app` |
| Expo slug / owner | `WalletTrails` / `mustafaezzi` |
| Play build type | **AAB** (Android App Bundle) via EAS `production` |
| Config | `mobile/eas.json` → profile `production` → `buildType: "app-bundle"` |

---

## 0. Unblock “Create app” (do this first)

Your console currently shows:

> **Complete account verifications to create new apps.**

Until this is finished, **Create app** stays disabled.

1. Open [Google Play Console](https://play.google.com/console).
2. In the left sidebar open **Android developer verification** (and/or **Developer account** / any **Action required** banners at the top).
3. Complete every required step. Typical items for a **Personal** account:
   - Identity / government ID verification
   - Contact email and phone confirmation
   - Developer name / organization display name (**PowerPulse Labs**)
   - Payment profile / registration fee (if not already paid)
   - Any **D-U-N-S** or org docs only if Google asks you to switch to an Organization account (Personal accounts usually skip this)
4. Wait until status is **Verified** / setup complete (can take hours to a few days).
5. Refresh Home — **Create app** should become clickable.

Do not start building store listings until Create app works; you need an app entry first.

---

## 1. Create the app in Play Console

1. Home → **Create app**.
2. Fill in:
   - **App name:** `WalletTrails` (or `WalletTrails Expense Tracker` if you want stronger Play search keywords; you can refine later in Store listing).
   - **Default language:** English (United States) or English (United Kingdom) — pick one and stay consistent.
   - **App or game:** App.
   - **Free or paid:** Free.
3. Accept the declarations (Play policies, US export laws, etc.).
4. Create the app. You land in that app’s dashboard.

**Package name note:** The Play Console package is locked to whatever you upload in the **first** AAB. Your project already uses `com.WalletTrails.app` in `mobile/app.json`. Do **not** change this after the first upload.

---

## 2. Finish Play Console “Setup” checklist

In the app dashboard, Google shows a left-nav checklist. Complete these before production release.

### 2.1 Store listing (Main store listing)

Prepare assets before filling forms:

| Asset | Requirement (approx.) | Source idea |
|-------|----------------------|-------------|
| App icon | 512 × 512 PNG | Export from `mobile/assets/images/icon.png` |
| Feature graphic | 1024 × 500 PNG | Brand banner with WalletTrails + PowerPulse Labs |
| Phone screenshots | ≥ 2 (max 8); JPEG/PNG | Home, Budgets, Wallets, Bills, etc. |
| 7-inch / 10-inch tablet | Optional unless you claim tablet support | WalletTrails is phone-oriented |

**Short description** (≤ 80 characters) — example:

```text
Track expenses, budgets, bills & family spending in one place.
```

**Full description** — cover: wallets, budgets, bills/reminders, household, bank SMS/notification import (optional permission), privacy lock. Do not promise banking features you do not offer.

**Privacy policy URL (required):**  
You must host a public HTTPS privacy policy that mentions:

- Account / email data
- Financial transaction data stored on your servers
- Optional **SMS** and **notification access** for bank alert import
- Analytics (PostHog) if enabled
- How to delete account / data

Use your live site or a docs page (e.g. `https://your-domain/privacy`). Without this URL, you cannot complete the listing.

**Contact email:** a monitored address (same as Play developer contact if possible).

### 2.2 Store settings

- App category: **Finance** (or Productivity if you prefer).
- Tags: expense tracker, budget, etc. (within Google’s limits).

### 2.3 Set up your app → App access

- If all features work after normal signup: **All functionality available**.
- If reviewers need a demo login: provide username/password and instructions (recommended for finance apps).

### 2.4 Ads

- Declare whether the app contains ads (WalletTrails today: usually **No** unless you ship AdMob).

### 2.5 Content rating

1. Start the questionnaire (IARC).
2. Answer honestly (finance app, no user-generated social feed, no violence, etc.).
3. Apply the generated rating.

### 2.6 Target audience

- Select age groups (typically 18+ for finance; follow the form).
- Confirm you are not primarily targeting children (WalletTrails is not a kids app).

### 2.7 News / Data safety / Government apps

- **News app:** No.
- **Government app:** No (unless you are one).
- **Data safety:** Fill carefully — see §3 below.

### 2.8 Countries / pricing

- Select countries (start with Pakistan + others you support).
- Free app → price $0.

---

## 3. Data safety form (important for WalletTrails)

In **App content → Data safety**, declare what you collect and share.

Typical WalletTrails declarations (adjust to match your real backend + PostHog):

| Data type | Collected? | Shared? | Purpose |
|-----------|------------|---------|---------|
| Email / account | Yes | No (unless a vendor) | App functionality, account management |
| Financial info (transactions you store) | Yes | No | App functionality |
| App activity / analytics | Yes if PostHog on | Check PostHog as “shared with third party” if events leave your device to PostHog | Analytics |
| Device or other IDs | Often yes for analytics | Same as above | Analytics |

Also declare:

- Data is **encrypted in transit** (HTTPS).
- Users can **request deletion** (describe how — Settings / email / account delete).
- Sensitive permissions: SMS / notification listener are **optional** features for bank import — say so in the privacy policy and in-app permission copy.

Google rejects listings that under-declare SMS or financial data.

---

## 4. Sensitive permissions (SMS + notifications)

WalletTrails requests SMS-related Android permissions and can use notification access for bank apps. Play review will ask for justification.

1. In Play Console → **App content** / **Sensitive permissions** (wording varies), declare **SMS** / **Call log** only if the merged manifest still requests them.
2. Explain: *Optional feature to parse bank debit/credit SMS or bank-app notifications into expense drafts; not used for spam or reading unrelated messages.*
3. Video (strongly recommended): 1–2 minute screen recording showing:
   - Enable Bank alerts in Settings  
   - Receive/import a sample alert  
   - User approves a draft expense  

Upload when Google asks for a demo video.

If review is painful, you can ship **v1 without SMS permissions** and add bank import in a later release — only if product allows it. Current `app.json` includes `RECEIVE_SMS` / `READ_SMS`.

---

## 5. Build a Play-ready AAB with EAS

Work from the `mobile` folder on a machine with Node and an Expo account that owns `WalletTrails`.

### 5.1 One-time setup

```powershell
cd d:\My-Wallet\mobile
npm install
npx eas-cli login
npx eas whoami
npx eas project:info
```

Confirm the project matches Expo owner `mustafaezzi` / slug `WalletTrails`.

### 5.2 Credentials (signing key)

First production Android build will prompt EAS to create or reuse a **Google Play upload keystore**.

- Prefer **Let EAS manage credentials** (recommended).
- Download/backup the credentials from Expo when offered — if you lose the upload key and do not use Play App Signing correctly, updates become painful.
- In Play Console you will use **Play App Signing** (Google holds the app signing key; you upload with the upload key). Accept Google’s default when creating the first release.

### 5.3 Environment / secrets

`eas.json` production already sets:

- `EXPO_PUBLIC_API_URL` → Railway backend  
- `EXPO_PUBLIC_POSTHOG_HOST`

Set any missing secrets in [Expo dashboard](https://expo.dev) → Project → **Environment variables** for **production** (e.g. `EXPO_PUBLIC_POSTHOG_KEY`) so they are not committed to git.

### 5.4 Version numbers

- User-facing version: `expo.version` in `mobile/app.json` (currently `1.0.0`).
- `eas.json` has `"appVersionSource": "remote"` and production `"autoIncrement": true` — EAS increments **versionCode** on each production build. Keep `version` (e.g. `1.0.0` → `1.0.1`) bumped when you want users to see a new marketing version.

### 5.5 Run the production build

```powershell
cd d:\My-Wallet\mobile
npx eas build --platform android --profile production
```

- Wait for the build on expo.dev (often 10–30+ minutes).
- Download the **.aab** when finished (or submit directly in the next section).

**Do not upload a `.apk` to Play production.** Preview/dev profiles in this repo build APKs for sideload only; Play wants the production **app-bundle**.

---

## 6. Upload the AAB to Play Console

### Option A — Manual upload (clearest first time)

1. Play Console → your app → **Test and release** → **Production** (or start with **Internal testing** — recommended).
2. **Create new release**.
3. If prompted, enroll in **Play App Signing**.
4. Upload the `.aab` from EAS.
5. Release name: e.g. `1.0.0 (1)` — match version + versionCode.
6. Release notes (what’s new for users).
7. Save → Review release → **Start rollout to Internal testing** first.

### Option B — EAS Submit (after first manual link)

`eas.json` already has:

```json
"submit": {
  "production": {}
}
```

First time, create a Google Cloud service account with Play Developer API access, invite it in Play Console → Users and permissions, download JSON key, then:

```powershell
cd d:\My-Wallet\mobile
npx eas submit --platform android --profile production --latest
```

EAS will ask for the service account JSON path (or store it in Expo credentials). After that, submits can be mostly automated.

**Recommendation:** First release = manual upload to **Internal testing**. Automate submit once that path works.

---

## 7. Recommended release path

```text
Internal testing  →  Closed testing (optional)  →  Open testing (optional)  →  Production
```

1. **Internal testing**
   - Add your Gmail (+ testers) under Testers.
   - Install via the opt-in link on a real Android phone.
   - Verify login, budgets, bills, bank alerts (if included), update dialogs.
2. Fix crashes → new EAS production build → new release on the same track.
3. When stable, promote the release to **Production** (staged rollout 20% → 50% → 100% is safer than 100% day one).

Production also requires all **App content** / policy tasks to be **Completed** (green).

---

## 8. Pre-launch checklist (WalletTrails-specific)

- [ ] Play account verification done; Create app enabled  
- [ ] Privacy policy URL live and accurate (SMS / notifications / analytics / deletion)  
- [ ] Data safety form matches real behavior  
- [ ] Content rating completed  
- [ ] Store listing: icon, feature graphic, ≥2 screenshots, descriptions  
- [ ] Production EAS build succeeded (`.aab`, package `com.WalletTrails.app`)  
- [ ] Internal test install works against production API (`EXPO_PUBLIC_API_URL`)  
- [ ] Demo account ready for Google reviewers if login is required  
- [ ] SMS / notification permission justification (+ video if requested)  
- [ ] Backend (Railway) awake and migrations applied (e.g. budgets `0025`)  
- [ ] Support email / contact path works  

---

## 9. After you are live — later updates

For each store update:

1. Change code in `mobile/`.
2. Bump `version` in `app.json` when appropriate (`1.0.0` → `1.0.1`).
3. `npx eas build --platform android --profile production` (versionCode auto-increments).
4. Upload AAB / `eas submit` to Production (or testing track).
5. Write “What’s new” release notes (Budgets, fixes, etc.).
6. Roll out.

Keep the same package name and the same upload keystore (EAS-managed).

---

## 10. Common blockers

| Problem | What to do |
|---------|------------|
| Create app grayed out | Finish **Android developer verification** / account setup (§0) |
| “You need a privacy policy” | Host HTTPS policy and paste URL in Store listing |
| Rejected for SMS | Narrow policy text, in-app disclosure, demo video; or remove SMS for v1 |
| Wrong package / signing | Never change `com.WalletTrails.app` after first upload; keep EAS credentials |
| Uploaded APK rejected | Use `production` profile AAB only |
| App crashes on review device | Test internal track; ensure API URL and CORS/auth work for reviewers |
| “Incomplete store listing” | Feature graphic + screenshots + all App content tasks |

---

## 11. Quick command cheat sheet

```powershell
cd d:\My-Wallet\mobile

# Login / project
npx eas-cli login
npx eas whoami

# Production AAB for Play Store
npx eas build --platform android --profile production

# Optional: submit latest Android build to Play
npx eas submit --platform android --profile production --latest

# Sideload APK for friends (NOT for Play production)
npx eas build --platform android --profile preview
```

---

## 12. What you should do next (today)

1. Complete **Android developer verification** until Create app is enabled.  
2. Create the **WalletTrails** app (`com.WalletTrails.app` will be set by the first AAB).  
3. Draft privacy policy + store screenshots.  
4. Run `eas build --platform android --profile production`.  
5. Upload the AAB to **Internal testing** and install it yourself.  
6. Finish Data safety + content rating, then promote to Production when Google’s checklist is green.

If you want, after verification is done we can next: draft store listing copy, a privacy-policy outline, or wire `eas submit` credentials step-by-step.
