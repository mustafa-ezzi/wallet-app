# WalletTrails Android — does it meet the Play research?

**What this is:** A check of the Android app and Django billing code against the notes in this folder. It is not a full Play policy review (privacy, SMS, ads, and Data safety are separate).  
**Checked:** 21 October 2026  
**App:** Expo / React Native, Android package `com.wallettrails.android` (`mobile/app.json`)  
**Compared with:**

- [subscriptions.md](./subscriptions.md) — what the paywall is allowed to say
- [create-and-manage-subscriptions.md](./create-and-manage-subscriptions.md) — Play Console objects
- [understanding-subscriptions.md](./understanding-subscriptions.md) — how plans, price changes, and failed payments behave
- [provide-subscriptions-in-the-app.md](./provide-subscriptions-in-the-app.md) — app, Play, and server
- [play-app-signing-terms.md](./play-app-signing-terms.md) — who holds the signing key
- [android-app-bundles.md](./android-app-bundles.md) — the file Play accepts

**Short answer:** The app is shaped so people can use it without paying, and the production build is an Android App Bundle. It does **not** yet meet the rules for selling a subscription. There is no Play purchase sheet, no acknowledgement, and no renewal listener. Do not turn on a paywall until the items in section 3 are done.

Play Console itself (payments profile, created products, App Signing enrollment, upload-key backup) cannot be seen from this repo. Those are marked **Console** below.

---

## 1. Already in good shape

| Requirement | Where it shows up | Status |
| --- | --- | --- |
| People can use the app without a subscription | No paywall. Home, wallets, and add-transaction do not block on Premium. Premium is a badge and an ad switch. | Met |
| A subscription is not required to open the app | Same. Settings still shows **Cancel subscription**, which is the right place once billing exists. | Met |
| Production file is an app bundle, not an APK | `mobile/eas.json` → `production` → `buildType: "app-bundle"` | Met |
| Sideload builds are a full APK | `preview` and `development` profiles build an APK | Met |
| No expansion files, no feature modules | Nothing in the project uses `.obb` or Play Feature Delivery | Met |
| Install size is not near 4 GB | Not measured from a built bundle. This is a finance client with no game assets. Nothing in the project suggests a multi-GB download. | Met for this app |
| Cancel link in account settings | Android Settings → **Cancel subscription** opens Play’s Subscription Center for `com.wallettrails.android`, and adds `&sku=` when the product is `premium_monthly` or `premium_yearly` | Met |
| Lifetime is not a subscription in our data model | `premium_lifetime` is a separate product. The server checks the one-time products API if the subscription call fails. Expiry is empty for lifetime. | Met in code. Still must be created in Play as an in-app product, not a subscription. |
| Server does not trust the phone by itself | `PremiumVerifyView` asks the Play Developer API before it creates an entitlement | Met for the verify call. See the gaps: nothing in the app sends a token yet, and a missing service account returns “not configured”. |
| Purchase tokens are not stored raw | The server stores a SHA-256 hash. Logs and admin show the hash, not the token. | Met |
| Debug “skip Google verify” cannot run in production | `PLAY_BILLING_SKIP_VERIFY` works only when Django `DEBUG` is on | Met |
| Product IDs avoid `android.test` | `premium_monthly`, `premium_yearly`, `premium_lifetime` | Met |
| Recurring value, if we sell Plus / Pro as ongoing features | The planned benefits (limits, no ads, sharing, automation) continue for the whole paid period. The app does not sell a one-time perk through a subscription. | Met as a product shape. Not on sale yet. |

---

## 2. Not on sale yet — these rules are not broken, and not done

There is no plan picker, no trial screen, and no “Subscribe” button. Google’s paywall examples do not apply until that screen exists. When it does, it has to match [subscriptions.md](./subscriptions.md) on the first version:

- The big number is the real charge (the yearly total, not a monthly split).
- The period and “renews automatically” are on that same screen.
- Close / Not now is obvious, because the free app keeps working.
- Price and words come from Play for that user’s country, not a hard-coded currency.
- A trial states the length, the price after, that it charges automatically, and how to cancel.
- The product is not named “Free Trial”.
- The subscribe button is not the same “Next” spot used on earlier screens.

---

## 3. Must finish before anyone can subscribe

These are the gaps. A real purchase today would either never start, or Google would refund it.

### 3.1 The app never starts a Play purchase

`mobile/package.json` has no Play Billing library. Nothing calls Play to load a price or open Google’s payment sheet. **Restore Purchase** in Settings only re-reads our server. It does not ask Play for an existing purchase.

Build this in an EAS build (Expo Go cannot):

- [ ] Add a Play Billing wrapper and ship it in the production bundle (that also merges the billing permission)
- [ ] Show the price Play returns, not a price we typed
- [ ] Open Google’s payment sheet for Subscribe
- [ ] If the purchase is pending, do not unlock
- [ ] On launch and after login, send any Play purchase the phone already has to the server
- [ ] Send the purchase token to `PremiumVerifyView` and unlock only when the server says it is paid

### 3.2 The server never tells Google “we delivered it”

Verify reads `acknowledgementState` and then stops. Nothing calls Play’s acknowledge API. `PurchaseEvent` has an `acknowledged` status that no code sets.

- [ ] After a successful verify, acknowledge from the server within **3 days** (within **half the plan length** if we ever sell a prepaid plan shorter than a week)
- [ ] Do not acknowledge a pending payment
- [ ] Acknowledge lifetime as a non-consumable. Do not consume it
- [ ] A restore of an already-acknowledged purchase must not acknowledge again

If this stays missing, Play refunds the user and takes the subscription away.

### 3.3 Renewals, cancels, and failed payments never update access

Nothing listens for Play’s real-time notifications. After the first verify, access lasts until `expires_at` (30 days or 365 days if Play did not send an expiry). A renewal would not extend that date. A refund or account hold would not turn Premium off early.

- [ ] Pub/Sub topic in Play Console, and a server endpoint that treats the message as a ping
- [ ] On each ping, ask Play for the current state and update expiry, cancel, grace, hold, pause, or revoke
- [ ] During **grace**, keep Premium on. During **account hold**, turn it off. Grace plus hold must be at least 30 days on the base plan
- [ ] A **$0.00** resubscribe before the period ends keeps the same expiry. It is not a new sale and it does not start a new 30 or 365 days
- [ ] Re-check active tokens on a schedule, in case a notification is missed

### 3.4 Decide the Play products before clicking Create

IDs cannot be changed or reused. The code still treats `premium_monthly` and `premium_yearly` as two product IDs. Play’s current model wants one subscription with two base plans if monthly and yearly are the same benefits.

- [ ] Write down the choice: two subscriptions that match today’s IDs, **or** one subscription plus base plan IDs (that second choice needs app and server changes)
- [ ] Create `premium_lifetime` as an **in-app product**, not a subscription
- [ ] Public name is the real plan, not “Free Trial”
- [ ] Up to four benefits, each a feature, none mentioning a price or a trial
- [ ] Activate at least one base plan, with countries and prices
- [ ] If there is a trial, it is an offer (3 days to 3 years) on that base plan, not a benefit line
- [ ] Do not use installments unless the plan is only for Brazil, France, Italy, and Spain

### 3.5 Price rises and pause, when we use them

Not required for the first sale. Required before we change a price or turn pause on.

- [ ] A higher price for people already subscribed is **opt-in**, unless every opt-out rule in [understanding-subscriptions.md](./understanding-subscriptions.md) is true
- [ ] The app has a privacy policy only (`mobile/src/constants/legal.ts`). Opt-out rises also need terms that reserve the right to raise the price, plus a 30-day in-app notice. Do not use opt-out until that exists
- [ ] Yearly plans and free trials cannot be paused. Pause is a Play Console switch, not something the app should invent

---

## 4. Console steps the repo cannot prove

| Item | What the repo shows | What a person still has to do |
| --- | --- | --- |
| Payments profile | Nothing | Play Console → payments profile, so payouts can happen |
| Play App Signing | Production builds an AAB, which requires it | On the first upload, let Google create the app signing key. Do not expect to download that private key later |
| Upload key backup | `*.jks` and `*.keystore` are gitignored. The repo does not contain a backup | When EAS offers the upload keystore, download it and store it outside the repo. Losing it is recoverable through Play. Losing the app signing key is not |
| Products activated | Only the ID strings in code | Create and **Activate** them in Play Console |
| Service account | Server reads `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Package default is `com.wallettrails.android` | Create the service account, grant it access to this app, and set the env var in production. Until then, verify returns “not configured” |
| License testers | Nothing | Test purchases with a build installed from a Play test track, not a sideloaded APK |
| Grace, hold, pause, opt-out countries | Not configured in code | Set them on the base plan and under Monetization setup when those products exist |

---

## 5. One mismatch to keep straight

Older notes in this folder, and some launch checklists, still say the Android package is `com.wallettrails.app`. The Android app, the cancel link, the Play Store update link, and the server default are **`com.wallettrails.android`**. iOS is still `com.wallettrails.app`.

The first AAB locks the Android package. Subscriptions, the service account, and the Subscription Center link must all use `com.wallettrails.android`.

---

## 6. Work order

1. Confirm Play App Signing on the first AAB, and back up the EAS upload key.
2. Choose subscription IDs and create them in Play Console. Keep lifetime as a one-time product.
3. Add Play Billing to an EAS build. Show Play’s price. Send the token to the server.
4. Acknowledge from the server after verify.
5. Add real-time notifications, and turn Premium off during account hold.
6. Only then build the paywall, using the checklist in [subscriptions.md](./subscriptions.md). Put the Subscription Center link on that screen as well as in Settings. It is already in Settings.
