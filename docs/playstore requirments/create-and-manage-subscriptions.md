# Google Play — Create and manage subscriptions (plain language)

**What this is:** A simple rewrite of Google’s Play Console guide for setting up subscriptions. It is the “which buttons, which IDs, which objects” page. The rules about honest pricing and cancellation are in [subscriptions.md](./subscriptions.md). How the app and server complete a purchase is in [provide-subscriptions-in-the-app.md](./provide-subscriptions-in-the-app.md).  
**Official source:** [Create and manage subscriptions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/140504)  
**Background:** In May 2022 Play changed how subscriptions are built. Older subscriptions are explained in Play’s article “Recent changes to subscriptions in Play Console.”  
**Written:** 17 October 2026  
**Status:** Console how-to. The official page is the source of truth if a screen label changes.

You do not create “a monthly subscription” as one blob. You create three things, **in this order**:

| Object | What it is | Example |
| --- | --- | --- |
| **Subscription** | The product. Name, benefits, icon. Users see the name in email and in Play’s Subscription Center. | `plus` — “WalletTrails Plus” |
| **Base plan** | How it bills, how long access lasts, and the normal price. A subscription does nothing for buyers until at least one base plan is **activated**. | `monthly`, `yearly` |
| **Offer** | Optional discount or free trial on **one** base plan. The base plan can sell without any offer. | `trial-7d` on the yearly plan |

---

## 1. Before you create anything

You can use Play billing only if your country is a supported place to register as a merchant. Then:

1. Set up a **payments profile**.
2. Read the [Subscriptions policy](./subscriptions.md) and the [Play Billing API docs](https://developer.android.com/google/play/billing).
3. Decide every ID **before** you click Create. After an ID is used, you cannot change it, and you cannot reuse it.

| ID | Rules | Locked when |
| --- | --- | --- |
| Product ID (the subscription) | Starts with a number or lowercase letter. Then letters, numbers, `_`, or `.`. **Max 40 characters.** `android.test` and anything starting with `android.test` are reserved. Unique in the app. | The moment you create the subscription |
| Base plan ID | Starts with a number or lowercase letter. Then `0-9`, `a-z`, or `-`. Unique **inside that subscription**. | After the base plan is **activated** |
| Offer ID | Same character rules as a base plan ID. Unique **inside that base plan**. | After the offer is **activated** |

Path for almost everything below: **Monetize with Play > Products > Subscriptions**.

---

## 2. Create the subscription

1. Open **Subscriptions** and click **Create subscription**.
2. Enter the product ID and a **name of up to 55 characters**.
3. Click **Create**, then **Edit subscription details**.

The name is public. It must describe the real offer. Do not name it “Free Trial.”

Then fill in:

| Field | Who sees it | Rules |
| --- | --- | --- |
| **Benefits** | Users | Up to **4** lines, **40 characters** each. Describe the feature (“No ads”, “Unlimited wallets”). Do **not** mention a price or a free trial. “Try 7 days free” is not allowed, because not every user gets that offer. |
| **Description** | Only you | Optional. Never shown on Google Play. |
| **Icon** | Play Store and other Google surfaces | Optional, but useful. Must be accurate and appropriate. |
| **Tax and compliance** | Play, for law and tax | If Play asks, open **Manage settings** and complete it. |

Play’s content rules apply to the name, description, icon, and other metadata: accurate, not misleading, not inappropriate.

Click **Save changes**.

The subscription is still not for sale. It needs an **activated base plan**.

**You cannot delete a subscription after it has a base plan.** When you stop selling it, you **archive** it.

To edit later: Subscriptions → arrow on that subscription → **Edit subscription details** → **Save changes**.

---

## 3. Base plans

A base plan is the real product people buy: period, price, and countries.

**Subscriptions → arrow on the subscription → Add base plan.**

### 3.1 Pick a type

| Type | How the user pays | Where it can be sold |
| --- | --- | --- |
| **Auto-renewing** | Play charges again at the end of each period unless the user cancels | Your chosen countries |
| **Prepaid** | No auto-charge. The user pays manually to add more time | Your chosen countries |
| **Installments** | A fixed amount every month for a commitment of **3 to 24 months**. Renews unless the user cancels | **Brazil, France, Italy, and Spain only** (at the time of this guide) |

### 3.2 Auto-renewing settings

- **Billing period** (this is how long each payment covers): weekly, every 4 weeks, monthly, every 2 / 3 / 4 / 6 / 8 months, or yearly.
- **Grace period:** if a renewal payment fails, the user **keeps access** while Play retries, up to this length.
- **Account hold:** starts **after** grace. Play may still retry, but the user **must not have access**. On by default. Length defaults to **60 days minus the grace period** (a 7-day grace leaves a 53-day hold). You can shorten or turn hold off. A shorter hold recovers fewer failed payments.
- **Plan and offer changes:** you choose what happens to days the user already paid for if they switch.
- **Resubscribe:** if on, someone whose plan has **expired** can buy it again from the Play Store.

Failed renewal, in order: **grace (still paid features) → hold (features off) → subscription ends.**

### 3.3 Prepaid settings

- **Duration:** 1 day, 3 days, 1 week, 4 weeks, 1 month, 2 / 3 / 4 / 6 / 8 months, or 1 year.
- **Allow extension:** if on, a user who already has this prepaid plan can buy more time from the Play Store.

### 3.4 Installment settings

- **Commitment period:** 3–24 months.
- **Renewal type:** after the commitment, either keep charging **month by month**, or start **another commitment of the same length**, unless the user cancels.
- Grace period, account hold, plan changes, and resubscribe work as they do for auto-renewing plans. Plan-change behavior for installments is documented on the Android developers site.

### 3.5 Tags, countries, and price

- **Tags** (optional): up to **20**. Your app can read them to decide which offer to show when someone qualifies for more than one. Tags can sit on a base plan or on an offer.
- **Countries:** **Manage country/region availability**. Play uses the user’s **Play country**, not their GPS location. They can buy only where this base plan is available.
  - **New countries/regions:** if you turn this on, Play will also turn the plan on later when it adds a buyer currency in a country where you already distribute the app.
  - Installments only let you pick Brazil, France, Italy, and Spain.
- **Price many countries at once:** **Update prices** → pick countries → **Set price** → enter a **tax-exclusive** price. Play converts it, adds tax where the store price must include tax, then rounds it to a normal local price ending. **Update**, then **Save**.
- **Price one country:** pencil icon in the Price column. Tax is applied after you enter it. If Play has no local currency there, price it in **USD or EUR**.

### 3.6 Activate, edit, turn off

**Save**, then **Activate**. Until you activate, users cannot buy it.

Editing: Subscriptions → subscription → **Base plans and offers** → arrow on the plan → **Save changes**. If the change is a **price** change, read Play’s “Changing base plan and offer prices” article first. Price changes have their own rules for who keeps the old price.

**Removing a country:** remove that country from **every offer** on the plan first. New buyers there can no longer purchase. People **already** on an auto-renewing plan in that country **keep renewing**.

**Deactivate** (top right of the base plan) stops **new** purchases only. Current subscribers stay, and auto-renewal continues until **they** cancel. To stop charging them, cancel or refund those orders from Play’s order tools (**Manage your app’s orders and issue refunds**).

**Activate** again (bottom of the page) to allow new purchases.

---

## 4. Offers (trials and discounts)

An offer is optional. It hangs off **one** base plan. You need that base plan saved (draft or active) first. Offers can be added to **auto-renewing** and **installment** plans.

Same honesty rules as the policy: in promos and splash screens, state the length, the price after the offer, how often billing runs, how to cancel, and whether the app requires a subscription. The user must see this without an extra tap. Details: [subscriptions.md](./subscriptions.md).

**Subscriptions → subscription → Base plans and offers → Add offer → pick the base plan.**

- Offer ID: unique on that base plan, permanent after activation.
- Countries: starts as the same list as the base plan. You may **shrink** it. You cannot add a country the base plan does not have.
- **Tags:** up to 20, same idea as on a base plan.

### 4.1 Who can get it

| Eligibility | Meaning |
| --- | --- |
| **New customer acquisition** | Either people who **never had this subscription**, or people who **never had any subscription in this app**. You pick one. |
| **Upgrade** | Only people who **currently have** a subscription you name. You can also require a billing period (for example, “any monthly plan” → offer a yearly upgrade). **Redemption gap:** they can take it **once**, or **unlimited** times. |
| **Developer determined** | Your app decides. Use this for a second-chance trial or a win-back for someone who already lapsed. |

### 4.2 Phases (the actual discount)

An offer needs **at least one** phase. **Phases → Add phase.**

| Phase type | What the user pays |
| --- | --- |
| **Free trial** | Nothing, for a length you set. Minimum **3 days**, maximum **3 years**. |
| **Single payment** | One upfront price for a length you set (days, weeks, or months). |
| **Recurring payment** | A price each billing period, for a number of periods you set. |

For paid phases, the price can be:

- a **fixed amount** (for example $5)
- a **percentage off** the base price (for example 50%)
- a **fixed amount off** the base price (for example $1 off)

Set discounts the same way as base-plan prices (all countries, or the pencil on one row). Play converts currency and adds tax where required. Only **fixed-amount** offers are then rounded to a local price ending.

**Save**, then **Activate**.

### 4.3 Edit or turn off an offer

Edit from **Base plans and offers**. Price changes again belong to the price-change article.

**Deactivate** blocks new redemptions. People **already** on that offer **keep it**. **Activate** turns new redemptions back on.

---

## 5. Legacy price cohorts

A **legacy price cohort** is a group of existing subscribers who stayed on an **old** price after you changed the base plan price. Each group is identified by the date that old price started.

You can end a cohort and move those people to the **current** base plan price. Do this only after reading **Changing base plan and offer prices**. That article has the region, frequency, and amount rules. This page does not repeat them. If a rise does not meet those rules, Play Console shows a warning and the rise is **opt-in** (the user must agree) instead of **opt-out**.

**Subscriptions → subscription → three dots on the base plan → View legacy price points.**

If that menu item is missing, there is no cohort left. After you **start** a migration, those cohorts **disappear from Play Console even if the move is not finished**.

1. Pick the cohort’s **start date**. Ending it also ends **every earlier cohort** for that base plan in the countries you select. Each cohort can be a price drop, an opt-in rise, or an opt-out rise.
2. Pick countries. Hover a warning to see why a rise would be opt-in. Uncheck a country, or pick another start date, to leave that cohort alone.
3. **Review migration.** Check the country count and the price changes.
4. If you want opt-out rises wherever Play allows them, read the requirements and tick the certification box. Cohorts that do not qualify still get an **opt-in** rise.
5. If you do not want opt-out rises, choose **Always use opt-in price increases**. For “opt-out in some countries only,” run a **separate** migration for the other countries.
6. **Start migration.**

---

## 6. Let users pause instead of cancel

Pause is one switch for the app, not a setting on each plan.

**Monetize with Play > Monetization setup → Subscription settings → Pause → Create** (or **Disable**) → **Save changes**.

When it is on, eligible users see **Pause** in Play’s Subscription Center.

What pause actually does:

- It starts only **after the current paid period ends**.
- While paused, the user **cannot use** the subscription.
- When the pause ends, Play tries to charge a renewal. If that charge works, access comes back.
- Pausing or resuming is **not supported** if the subscription has **add-ons**.

Google documents the pause lengths and the app-side work on the Android developers site. The user chooses to pause; this is separate from you canceling them.

---

## 7. Checklist

**IDs**

- [ ] Product, base plan, and offer IDs are chosen and written down
- [ ] None of them will need to change later
- [ ] Nothing uses `android.test`

**Subscription**

- [ ] Public name describes the real plan, and is not “Free Trial”
- [ ] Up to 4 benefits, each a feature, none mentioning price or a trial
- [ ] Tax and compliance completed if Play asks

**Base plan**

- [ ] Type is auto-renewing, prepaid, or installments (installments only if you mean Brazil, France, Italy, or Spain)
- [ ] Grace and account hold are intentional
- [ ] Countries and tax-exclusive prices are set
- [ ] Plan is **Activated**
- [ ] You know deactivate does not stop existing renewals

**Offer, if any**

- [ ] Linked to the right base plan
- [ ] Eligibility is new customer, upgrade, or decided by the app
- [ ] At least one phase, and any free trial is between 3 days and 3 years
- [ ] The in-app screen states length, later price, renewal, and how to cancel
- [ ] Offer is **Activated**

**Pause**

- [ ] Decided on purpose under Monetization setup, not left as an accident

---

## 8. How this applies to WalletTrails

The app and backend today treat `premium_monthly`, `premium_yearly`, and `premium_lifetime` as separate product IDs. Play Console since 2022 thinks in **subscription + base plan + offer**. Pick one of these setups **before** creating IDs, because product IDs cannot be reused.

| Setup | Play Console | Matches today’s `product_id` values |
| --- | --- | --- |
| **Two subscriptions** | `premium_monthly` with one monthly base plan, and `premium_yearly` with one yearly base plan | Yes |
| **One subscription** | For example `premium`, with base plans `monthly` and `yearly` | No. The app and backend would also need to store the base plan ID |

`premium_lifetime` stays a **one-time in-app product**, not a subscription. A subscription has to keep delivering value on a schedule. See [subscriptions.md](./subscriptions.md).

A 7-day trial is an **offer** on a base plan (free-trial phase, 3 days to 3 years). It is not the subscription name, and it is not one of the four benefit lines.

Archive a subscription you stop selling. Deactivating a base plan only blocks new buyers; people already subscribed keep renewing until they cancel or you refund those orders.
