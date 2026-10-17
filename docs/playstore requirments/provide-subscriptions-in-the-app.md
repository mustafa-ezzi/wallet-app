# Google Play — Provide a subscription in the app (plain language)

**What this is:** How the app, Play Console, and our server work together so a subscription actually turns on. Console screens are in [create-and-manage-subscriptions.md](./create-and-manage-subscriptions.md). What you may say on the paywall is in [subscriptions.md](./subscriptions.md).  
**Official sources:** [Integrate the Play Billing Library](https://developer.android.com/google/play/billing/integrate) · [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions) · [About subscriptions](https://developer.android.com/google/play/billing/subscriptions)  
**Written:** 17 October 2026  
**Status:** Setup notes. Google’s developer docs are the source of truth if an API name changes.

WalletTrails is an **Expo / React Native** app (`com.wallettrails.app`) with a **Django** server. The Kotlin samples in generic billing guides are the native shape of this flow. We do not paste that Kotlin into the app. A Play Billing wrapper inside an EAS build calls the same steps. **Expo Go cannot.** It has no Play Billing native code.

One line: **Play charges the user, the phone only carries a purchase token, and the server asks Google whether that token is real before it unlocks anything.**

---

## 1. The path

| Step | Who | What happens |
| --- | --- | --- |
| 1 | Play Console | Payments profile exists. An app build is on a test track. A base plan is **activated**. |
| 2 | App | Connects to Play and asks for the live price of that product. |
| 3 | User | Taps Subscribe. Google’s own payment sheet opens. The app does not collect the card. |
| 4 | App | Receives a **purchase token** and sends it to our server. |
| 5 | Server | Asks the Google Play Developer API if that token is paid. |
| 6 | Server | Turns on Plus / Pro for that user. |
| 7 | Server | Tells Google the purchase was delivered (**acknowledge**), inside the time limit. |
| 8 | Google → server | Later pings the server when the plan renews, fails, is canceled, or expires. The server asks Google for the new state and updates access. |

The phone is not the source of truth. A modified app can claim it paid.

---

## 2. Prerequisites

Do these before writing purchase code.

**Payments profile.** Play Console account settings → merchant / payments profile, with the bank account that receives payouts. Without it, Play billing cannot sell.

**Billing permission.** The Play Billing Library has included `com.android.vending.BILLING` in its own manifest since Billing Library 1.0. You do not type that line into this Expo app by hand. The native billing package merges it into the release AAB. Before you rely on it, open the built bundle’s merged manifest and confirm the permission is there. Play uses that permission to know the app sells in-app products.

**A build on a test track.** Upload an AAB that contains that permission to an **internal** or **closed** track. You need that build to create and test products. License testers install **that** build, from the Play testing link, while signed into a tester Google account. A sideloaded debug build is not a Play purchase test.

---

## 3. Products in Play Console

Short version. The full click-path is [create-and-manage-subscriptions.md](./create-and-manage-subscriptions.md).

1. **Monetize with Play > Products > Subscriptions > Create subscription.**
2. Product ID, for example `premium_monthly`. It cannot be changed later.
3. **Add base plan:** auto-renewing or prepaid, billing period, countries, price.
4. Optional **offer:** free trial or intro price on that base plan.
5. **Save**, then **Activate.**

The app must request the same product ID Play has activated. A draft plan returns nothing.

---

## 4. What the app does

These are Play Billing Library calls. In this repo a wrapper makes them. The names below are the native names, so a wrapper’s docs can be matched to this list.

**Connect.** Build a `BillingClient`, set the purchases-updated listener, and turn on `enableAutoServiceReconnection()` so a dropped Play connection comes back. Then start the connection. Do this when the paywall (and restore) can run, not only after a tap.

**Load the price.** `queryProductDetailsAsync` with the product ID. Show the price, period, and offer Play returns. Do not hard-code “$4.99”. Play’s response is already in the user’s currency.

**Start checkout.** On Subscribe, `launchBillingFlow`. That opens Google’s sheet. Do not build a card form.

**Listen.** `PurchasesUpdatedListener` runs when the sheet finishes.

| Result | What to do |
| --- | --- |
| Purchased | Send the purchase token to the server. Wait for the server before unlocking. |
| Pending | Slow payment method. Do **not** unlock and do **not** acknowledge. The same listener fires again when it becomes purchased. The 3-day clock starts only then. |
| Canceled or error | Leave the user on the free plan. |

**Restore on launch.** Call the “query existing purchases” API when the app starts and after login. If Play still has an unacknowledged or active purchase, send that token to the server again. Reinstalling the app must not depend on the user buying twice.

---

## 5. Verify, unlock, acknowledge

### 5.1 Verify on the server

The app sends the purchase token, product ID, and package name to the backend over the signed-in API. The server calls the Play Developer API with a **service account** that has the `androidpublisher` scope and access to the app in Play Console.

Check the token against Google. Grant Plus / Pro only when Google says the purchase is paid (or in a free trial). Store a **hash** of the token if you need to recognize it again. Do not log the raw token.

If the check fails, or you decide the purchase is fraud, do not unlock. Do not wait out the acknowledge window. Refund and revoke it through the Developer API.

### 5.2 Acknowledge, or Google refunds

Acknowledgement means “we delivered the subscription.”

| Plan | Deadline |
| --- | --- |
| Auto-renewing, and prepaid plans of **1 week or longer** | **3 days** after the purchase becomes `PURCHASED` |
| Prepaid plan **shorter than 1 week** | **Half the plan length**. A 3-day prepaid plan must be acknowledged within **1.5 days** |

If you miss the window, Play **refunds and revokes** the purchase. For a prepaid top-up, missing it also cancels whatever time was left on that subscription.

Acknowledge **once**, from the **server**, after verification succeeds (`purchases.subscriptions.acknowledge`). The client can call `acknowledgePurchase` instead, but then a user who pays and never reopens the app can miss the deadline. Renewals of an auto-renewing plan do **not** need a new acknowledgement. Each prepaid purchase and each prepaid top-up **does**.

Check `acknowledgementState` first so a restore does not acknowledge twice.

---

## 6. Keep access correct after the sale

People renew, cancel, pause, or fail a payment without opening the app. The server has to hear about that.

**Real-time developer notifications (RTDN).** In Play Console, point monetization setup at a **Google Cloud Pub/Sub** topic. Google publishes a message when subscription state changes. The message is a signal, not the new entitlement. The server reads which token changed, calls the Developer API, and updates expiry, grace, hold, pause, or revocation from that response.

Treat a missing notification as possible. A periodic re-check of active tokens is the backup.

**Grace and hold** (set on the base plan): after a failed renewal the user can keep access during grace, then lose it during account hold, while Play retries. The server must follow those states. Do not leave Plus on for the whole hold just because the first purchase verified.

**Manage and cancel.** Settings needs a link to Play’s Subscription Center. There is no cancel button that only tells our server to stop charging. Play is the biller.

```text
https://play.google.com/store/account/subscriptions?package=com.wallettrails.app&sku=premium_monthly
```

Swap `sku` for the product the user actually bought. The package link without `sku` opens the list. Policy detail: [subscriptions.md](./subscriptions.md).

---

## 7. Checklist

**Console**

- [ ] Payments profile can pay out
- [ ] AAB on an internal or closed track includes the billing permission
- [ ] License testers use that Play install, not a sideload
- [ ] Subscription and base plan IDs match what the app will request
- [ ] Base plan is **Activated**

**App**

- [ ] Billing runs in an EAS build, not Expo Go
- [ ] Price on screen comes from `queryProductDetailsAsync`
- [ ] Checkout is `launchBillingFlow` (Google’s sheet)
- [ ] Pending purchases do not unlock
- [ ] Launch and login send any existing Play purchases to the server
- [ ] Settings links to the Subscription Center

**Server**

- [ ] Service account can call the Play Developer API for `com.wallettrails.app`
- [ ] Unlock happens only after Google verifies the token
- [ ] Server acknowledges within 3 days (1.5 days for a prepaid plan under a week)
- [ ] RTDN updates renewal, cancel, grace, hold, and revoke
- [ ] Raw purchase tokens are not stored in logs

---

## 8. How this applies to WalletTrails

| Piece | Today |
| --- | --- |
| App | Expo 57 / React Native. No Play Billing wrapper in the app yet, so there is no purchase sheet and no token to send. |
| Product IDs the server accepts | `premium_monthly`, `premium_yearly`, `premium_lifetime` |
| Verify API | `PremiumVerifyView` checks the token with the Play Developer API (subscription first, then one-time product for lifetime), then creates an entitlement. It stores a **hash** of the token. |
| Acknowledge | Not called. A real purchase would be refunded after the window in section 5.2 until the server acknowledges. |
| RTDN | Not wired. A renewal, cancel, or failed payment will not update access by itself. |
| Skip verify | `PLAY_BILLING_SKIP_VERIFY` works only when Django `DEBUG` is on. Leave it off in production. |

Lifetime stays a one-time product: verify it with the products API, and acknowledge it as a non-consumable (do not consume it). Monthly and yearly stay subscriptions.

When this is built, the app only collects a token and shows Play’s price. The server remains the place that decides Plus / Pro is on.
