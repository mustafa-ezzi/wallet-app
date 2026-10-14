# PostHog setup — what to send us

WalletTrails has **PostHog on web** (`frontend/src/lib/analytics.ts`) and **mobile APK** (`mobile/src/lib/PostHogRoot.tsx`). Add keys via Railway / EAS — never commit them to git.

---

## 1. Required — Project API credentials

Get these from [PostHog](https://app.posthog.com) → your project → **Settings** → **Project** → **Project API key** and **API host**.

| Field | Your value | Notes |
|-------|------------|--------|
| **Project API key** | `phc________________________` | Starts with `phc_` — this is the **public** browser/mobile key |
| **API host (ingest URL)** | `https://______.i.posthog.com` | US default: `https://us.i.posthog.com` · EU: `https://eu.i.posthog.com` |

**Which region is your PostHog project?** (circle one)

- [ ] US Cloud (`us.i.posthog.com`)
- [ ] EU Cloud (`eu.i.posthog.com`)
- [ ] Self-hosted (give full URL): `________________________`

---

## 2. Where we will put the keys (you set these — we wire the code)

### Web (Vite / Railway frontend)

```env
VITE_POSTHOG_KEY=phc_your_key_here
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

| Question | Your answer |
|----------|-------------|
| Railway service name for web frontend | e.g. `WalletTrails-web` / `frontend` |
| Production URL users open | e.g. `https://WalletTrails.up.railway.app` |

### Mobile (Expo — wired in `mobile/src/lib/PostHogRoot.tsx`)

```env
EXPO_PUBLIC_POSTHOG_KEY=phc_your_key_here
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

| Question | Your answer |
|----------|-------------|
| Same PostHog project as web? | [x] Yes (recommended) · [ ] No — separate project |
| Add to EAS env (`preview` + `production`)? | [ ] Yes · [ ] Preview only |

**EAS:** `EXPO_PUBLIC_POSTHOG_HOST` is already in `mobile/eas.json`. Add the **key** as an EAS environment variable (do not commit):

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_POSTHOG_KEY --value phc_YOUR_KEY --environment preview --environment production
```

Then run a **new APK build** — existing installs won’t pick up the key until rebuilt.

---

## 3. Product choices (check what you want)

| Feature | Web (current default) | Your preference |
|---------|----------------------|-----------------|
| **Pageviews** (SPA, on route change) | On | [ ] On · [ ] Off |
| **Session replay** | On (inputs masked) | [ ] On · [ ] Off |
| **Identify logged-in users** (id, email, name) | On | [ ] On · [ ] Off |
| **Track on local dev** (`localhost`) | Off (no key in `.env`) | [ ] Off · [ ] On (dev key) |

**Privacy**

- [ ] OK to send **email** on `identify` (already implemented for logged-in users)
- [ ] OK to send **premium / currency** as person properties (we can add)
- [ ] **Never** send transaction amounts or bank SMS body (already our rule — confirm)

---

## 4. Optional — PostHog project settings (you configure in PostHog UI)

We do **not** need these in chat unless you use them:

| Item | Needed? | Your notes |
|------|---------|------------|
| **Personal API key** (for server-side / exports) | Only if we add backend events later | |
| **Project ID** (numeric) | Optional — helps support | |
| **Data pipelines / webhooks** | Optional | |
| **Feature flags** | Optional — tell us if you want flags in app | [ ] Yes · [ ] Not now |

---

## 5. Domains to allowlist (recommended in PostHog)

Add these under **Project settings → Authorized URLs** (or equivalent):

| URL | Purpose |
|-----|---------|
| `https://WalletTrails.up.railway.app` | Production web |
| `http://localhost:5173` | Local Vite dev (if you test analytics locally) |
| `exp://` / custom scheme | Only if PostHog mobile SDK needs it |

**Your production web URL:** `________________________`

---

## 6. Events we already send (no setup needed — for your PostHog dashboards)

### Web

| Event | When |
|-------|------|
| `$pageview` | Every route change |
| `user_logged_in` | Login |
| `user_signed_up` | Signup |
| `transaction_created` | Add income/expense/transfer |
| `transaction_queued_offline` | Offline queue |
| `transaction_sync_success` / `transaction_sync_failed` | Sync |
| `wallet_created` | New wallet |
| `pwa_installed` | PWA install |
| `report_exported` | CSV/PDF export |
| `household_*` | Household create/join/expense/invite/etc. |
| `people_action_created` | People lend/borrow |
| `android_apk_download_click` | APK link |
| `android_install_tour_started` / `android_install_tour_finished` | Install walkthrough |

### Mobile (stub today — will flow to PostHog after wiring)

| Event | When |
|-------|------|
| `rating_prompt_*` | Rating flow |
| `reminder_*` | Notifications |
| `privacy_unlock_*` | App lock |
| `transaction_*` | Same as web offline layer |

---

## 7. Checklist before you send

- [ ] PostHog account created
- [ ] Project created (name: `________________________`)
- [ ] **Project API key** copied (`phc_…`)
- [ ] **API host** confirmed (US vs EU)
- [ ] Keys added to **Railway** frontend env (not committed to repo)
- [ ] (Optional) Keys added to **EAS** for mobile builds
- [ ] Authorized URLs include production domain

---

## 8. Paste block for the agent (fill and send)

```text
POSTHOG_REGION: US | EU | self-hosted
VITE_POSTHOG_KEY: phc_
VITE_POSTHOG_HOST: https://
EXPO_PUBLIC_POSTHOG_KEY: (same as web / separate / skip mobile for now)
PRODUCTION_WEB_URL:
SESSION_REPLAY: on | off
IDENTIFY_USERS: on | off
TRACK_DEV: off | on
SAME_PROJECT_WEB_AND_MOBILE: yes | no
FEATURE_FLAGS_WANTED: yes | no
NOTES:
```

---

## Current code references

- Web init: `frontend/src/lib/analytics.ts`
- Web env example: `frontend/.env.example`
- Mobile: `mobile/src/lib/PostHogRoot.tsx` + `mobile/src/lib/analytics.ts`
- Mobile env example: `mobile/.env.example`
