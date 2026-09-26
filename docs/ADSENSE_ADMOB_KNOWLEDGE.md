# AdSense & AdMob — How They Work & How to Add Them to WalletTrails

**Audience:** You (product owner) — plain English + exact project hooks  
**Product:** WalletTrails Android app + marketing / web surfaces  
**Status:** Knowledge guide (not an implementation ticket)

---

## 1. Two different Google products (do not mix them up)

| Product | What it is | Where it runs | WalletTrails use |
|---------|------------|---------------|------------------|
| **AdMob** | Ads **inside mobile apps** (Android / iOS) | Native SDK in the APK | **Primary** — banners (and later rewarded) in the Expo/React Native app |
| **AdSense** | Ads on **websites** | Script / auto ads on HTML pages | **Marketing site / blog / public web pages** — *not* the money screens of the logged-in finance web app |

**Rule of thumb**

- Phone app → **AdMob**
- Public website / blog → **AdSense**
- Logged-in finance UI (balances, transactions) → prefer **no ads** (trust + Google “sensitive finance” policies)

You already have research in `docs/REVENUE_AND_LAUNCH_RESEARCH.md`. This file is the **how it works / how to wire it** companion.

---

## 2. How money flows (simple mental model)

```
Advertiser pays Google
        ↓
Google shows an ad to your user
        ↓
You earn a share (eCPM / CPC depending on format)
        ↓
Google pays you (AdMob / AdSense account) after threshold + verification
```

- You do **not** talk to advertisers. Google is the middleman.
- **eCPM** = roughly “earnings per 1000 impressions.” Varies hugely by country (US high, PK/IN low).
- **Fill rate** = % of ad requests that actually get an ad. Empty slots = $0.
- **Premium / Plus** users should see **zero ads** (`premium_hides_ads` already exists in ops config).

---

## 3. AdMob — step-by-step for the Android app

### 3.1 One-time Google setup (you do this in a browser)

1. Create / open [Google AdMob](https://admob.google.com/) with the same Google account you use for Play Console (recommended).
2. Add an **app** → Android → package id **`com.WalletTrails.app`** (or the exact id in `mobile/app.json` / Play Console).
3. Create **ad units**:
   - Banner (required first)
   - Interstitial (optional; keep off for finance flows)
   - Rewarded (optional; e.g. “watch ad to unlock a report export”)
4. Copy each **unit ID** (looks like `ca-app-pub-XXXXXXXX/YYYYYYYY`).
5. Link AdMob to the **Play Console** app when asked (helps policy + payments).
6. Complete **payments profile** (tax / address) or you never get paid.

**Test vs production**

- While developing, use Google’s **official test unit IDs** (or mark your device as a test device).
- Never click your own live ads — that can get the account banned.

### 3.2 What WalletTrails already has

| Piece | Where | Role |
|-------|--------|------|
| Banner UI | `mobile/src/ads/AdBanner.tsx` | Renders banner when ads should show |
| Home placement | `mobile/app/(tabs)/index.tsx` | Imports `AdBanner` |
| Kill switch / units | Ops remote config + `frontend-admin` → **Ads & Config** | Turn ads on/off, set unit IDs, premium hides ads, countries, session gates |
| Backend flags | `premium_hides_ads`, ad unit fields on ops config | Server-driven — change without a new store release |

`AdBanner` only loads the real SDK if `react-native-google-mobile-ads` is installed in a **native (EAS) build**. Expo Go shows a dev placeholder when config says ads are on.

### 3.3 Install the SDK (when you are ready to show real ads)

From `mobile/`:

```bash
npx expo install react-native-google-mobile-ads
```

Then:

1. Add the AdMob **App ID** to native config (plugin / `app.json` / `app.config` as required by the library docs for your Expo SDK).
2. Put **production banner unit ID** into Ops → Ads & Config (`android_banner_unit`), or env used by remote config.
3. Rebuild with EAS (`preview` / `production`) — SDK does **not** appear in Expo Go.
4. On a test device: confirm banner loads with test ads first.
5. Flip `ads_enabled` / `banner_enabled` in admin when you want live traffic.

### 3.4 Recommended placement (finance-safe)

| Screen | Ads? | Why |
|--------|------|-----|
| Home (below fold / non-balance chrome) | Soft banner OK | Already wired via `AdBanner` |
| Settings / Support | Soft banner OK | Low trust risk |
| Add expense / Approve bank SMS / Wallets balances | **No** | Users are entering money; feels scammy + policy risk |
| Interstitials between every screen | **No** | High uninstall; bad for finance |

Ops already can delay ads (`show_after_sessions`) and throttle interstitials (`interstitial_min_interval_sec`). Keep interstitial **disabled** until you have a clear non-money moment.

### 3.5 Premium gate (how “things work” for paying users)

Typical flow already intended by the product:

1. Free user → remote config `shouldShowAds` true → banner may show.
2. User buys Plus/Premium (Play Billing) → entitlement synced → `premium_hides_ads` → ads stop.
3. You can kill all ads globally from admin if something goes wrong (policy, crash, bad eCPM).

---

## 4. AdSense — step-by-step for the website

### 4.1 When to use it

Use AdSense on:

- Marketing site (`wallettrails-site` or whatever public domain)
- Blog / help articles / SEO landing pages

Do **not** paste AdSense into the authenticated PWA money dashboard the same way you would a blog. Prefer AdMob on Android and a clean web app for logged-in users.

### 4.2 Google setup

1. Apply at [Google AdSense](https://www.google.com/adsense/).
2. Add your **site domain** and verify ownership.
3. Wait for approval (can take days–weeks; site needs real content + privacy policy).
4. Create ad units **or** use Auto ads.
5. Paste the AdSense script into the marketing site layout (HTML head / React layout once).
6. Add a **Privacy / Ads** disclosure (required for trust + often for compliance).

### 4.3 Approval tips

- Site must be live on a real domain (not only localhost).
- Enough original content (not an empty “coming soon”).
- Privacy policy page.
- No prohibited content; finance marketing is OK, but don’t promise banking or credit offers that violate AdSense policies.

---

## 5. Policies you must respect (finance apps)

Google treats **personal finance** as sensitive:

- Do not use user balances, debts, or “this user is broke” to target ads.
- Prefer **generic** ads; fill rate may be weaker than games.
- No misleading “download to get loan” overlays.
- Disclose ads in Play listing / privacy policy if you show personalized ads (and follow GDPR/consent where required — EU/UK need a consent form for personalized ads).

If you expand to EU: plan for **UMP / GDPR consent** before personalized AdMob requests.

---

## 6. Checklist — “ads are live”

### AdMob (app)

- [ ] AdMob account + payments profile done  
- [ ] App added with correct package name  
- [ ] Banner unit created; ID pasted in Ops Ads Config  
- [ ] `react-native-google-mobile-ads` installed + EAS rebuild  
- [ ] Test device sees **test** ads  
- [ ] Production: free users see banner; premium users do not  
- [ ] Kill switch tested (`ads_enabled = false`)  

### AdSense (site)

- [ ] Site approved  
- [ ] Script only on public marketing pages  
- [ ] Privacy policy mentions ads  
- [ ] No ads on sensitive logged-in money screens  

---

## 7. Common questions

**Q: Can one account do both AdMob and AdSense?**  
Yes. Same Google payments profile often serves both; products stay separate in the consoles.

**Q: Do I need AdSense to use AdMob?**  
No. App → AdMob only is enough for launch.

**Q: Why is my eCPM tiny in Pakistan/India?**  
Normal for banners. Strategy doc already says: don’t depend on T3 banner revenue; use Premium + T1 users.

**Q: Where do I turn ads off without shipping a new APK?**  
Admin → **Ads & Config** (ops remote config).

---

## 8. Related files in this repo

| File | Purpose |
|------|---------|
| `mobile/src/ads/AdBanner.tsx` | Banner component |
| `frontend-admin/src/pages/AdsConfigPage.tsx` | Ops UI for units + toggles |
| `docs/REVENUE_AND_LAUNCH_RESEARCH.md` | Strategy, pricing, where not to put ads |
| Backend ops / premium APIs | Entitlements + `premium_hides_ads` |

When you are ready to **implement** (install SDK, wire App ID, turn on production units), treat that as a separate engineering task using this document as the checklist.
