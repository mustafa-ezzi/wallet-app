# Google Play — Subscriptions (plain language)

**What this is:** A simple rewrite of Google’s official Subscriptions policy, so we can follow it when we design paywalls, trials, and cancellation.  
**Official source:** [Subscriptions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9900533)  
**Related:** [Create and manage subscriptions (plain language)](./create-and-manage-subscriptions.md) · [Understanding subscriptions](https://support.google.com/googleplay/android-developer/answer/12154973) · [Create and manage subscriptions (official)](https://support.google.com/googleplay/android-developer/answer/140504)  
**Written:** 17 October 2026  
**Status:** Policy notes. The official page is the source of truth if wording ever differs.

Google’s rule in one line: **say the real price, the real renewal, and the real benefit — on the screen where the user decides — and keep giving that benefit for as long as they pay.**

---

## 1. The three rules

### 1. Do not mislead

Do not trick people about what a subscription is, what it includes, or what they will pay.

This applies to:

- In-app promotions
- Splash screens
- The screen where the user picks a plan

Benefits you list must be true. Do not exaggerate, hide, or reword any part of the offer.

Google rejects apps that use a **deceptive or manipulative purchase flow**. That covers subscriptions and one-time in-app purchases.

### 2. Show the full offer without extra taps

The user must see the important facts **on the offer itself**. They should not have to open another page, expand a hidden section, or hunt through terms to learn the basics.

Show all of these, clearly:

| What to show | Plain meaning |
| --- | --- |
| Offer terms | What they get, and for how long any special price lasts |
| Cost | The amount they will actually be charged |
| Billing cycle | How often that charge happens (every month, every year, every 6 months, …) |
| Automatic renewal | That it renews and charges again unless they cancel |
| Is a subscription required? | Whether they can use the app without paying |
| Anything else that matters | Trial end date, price after the trial, how to cancel, and similar facts |

“Clearly and explicitly” means normal-size text, in the user’s language, in their currency. A tiny gray line under a giant “FREE” does not count.

### 3. A subscription must keep being worth paying for

A subscription is for **ongoing value**, not a one-time gift.

Allowed:

- Features that stay unlocked the whole time they are subscribed (no ads, unlimited wallets, exports, automation, and so on)
- A bonus on top of that ongoing value (for example, an extra month, or a small welcome perk)

Not allowed as a subscription:

- A pile of credits or in-app currency paid once
- A single-use booster or one-time unlock
- Anything that is really a one-time purchase dressed up as “subscribe”

If the product does not keep delivering value, sell it as an **in-app product** (a one-time purchase), not a subscription.

You also cannot change the deal after they buy:

- Do not cancel their subscription for them just because the one-time perk was delivered
- Do not deprecate or shrink the recurring benefit so the subscription becomes a one-time offer in practice

A promo bonus is fine only when the **main** benefit continues every billing period.

---

## 2. What Google treats as a violation

These are the examples from the policy, rewritten in plain words.

| Bad pattern | Why it fails |
| --- | --- |
| A monthly plan that never says it renews and charges every month | The user cannot tell it will keep billing |
| A yearly (or multi-month) plan whose **biggest** price is a monthly breakdown | The user thinks they are paying the small number, not the real charge |
| Price or terms not fully translated, or shown in the wrong currency | The user cannot understand the offer. Terms in the local language do not fix an offer still shown in another language or currency |
| A promo that hides the fact the app works without a subscription (when it does) | The user thinks they must pay to continue |
| A product name like **“Free Trial”** or **“Try Premium — 3 days free”** for a plan that will auto-charge | The name says “free.” The product is a paid, renewing subscription |
| Several screens in a row where the same button spot keeps saying Continue / Next, and the last tap subscribes | People subscribe by accident |
| Month 1 gives 1,000 gems, later months give 1 gem | The subscription does not keep its value |
| User must start an auto-renewing plan to get a one-time perk, then the app cancels that plan without them asking | A one-time benefit was forced through a subscription, then shut off |

---

## 3. Picture examples from the policy

Google’s help page shows two bad offer screens. There are no images here; these are the problems those pictures call out.

### Example 1 — the offer screen itself is misleading

1. **No obvious way to leave.** The close / “Not now” control is missing or hard to see. If the app works without a subscription, the user must be able to tell that and skip the offer.
2. **The big price is a monthly split, not the real charge.** Example: a 6‑month plan shouts a per-month figure. The user may not realize they are charged the full 6‑month price at signup.
3. **Only the intro price is shown.** The user cannot see what they will be charged automatically when the intro period ends.
4. **The offer is not localized.** Language and currency on the offer do not match the user’s country, even if the terms and conditions do. The user still cannot understand the deal.

### Example 2 — the flow and the trial price are misleading

1. **The same button position is used again and again.** Tap, tap, tap through the flow, and the last tap in that spot is “Continue” into a paid subscription. That is an accidental purchase.
2. **The price after the trial is hard to read.** If the amount they will be charged is tiny, faint, or easy to miss, people can believe the plan is free.

---

## 4. Free trials and introductory prices

Say all of this **before** the user is enrolled. Do not wait until a receipt or a later email.

The user must be able to answer these questions from the offer screen:

1. How long is the free trial or the cheap intro price?
2. What do they get during that time?
3. When does it turn into a normal paid subscription?
4. How much will that paid subscription cost, and how often?
5. How do they cancel if they do not want to be charged?

### Trial violations

| Bad pattern | What the user is left thinking |
| --- | --- |
| Trial length is missing or vague | “Free” might last forever |
| It never says they will be charged automatically when the trial ends | The trial is just free access |
| The app works without a trial, but the screen does not show that | They must start a trial to use the app |
| Price or terms are not in the user’s language and currency | They cannot check the real cost |
| No explanation of how to cancel before the paid period starts | They are stuck once they tap |

Same screen problems as the subscription examples:

- Dismiss / skip is missing or unclear, so people do not know they can use the app without the offer.
- The word “free” is huge, and the later charge is easy to miss.
- No trial length is stated.
- Offer language or currency does not match the user’s country.
- Cancel steps are not explained for people who do not want the paid plan after the trial.

**Name the product honestly.** Do not call an auto-renewing paid plan “Free Trial.” If there is a trial, the name and the screen should both say it is a subscription that will charge unless canceled.

---

## 5. Manage, cancel, and refunds

If the app sells subscriptions, two things are required:

1. The app **explains** how to manage or cancel.
2. The app gives an **easy online way** to cancel. Cancel cannot be phone-only, email-only, or buried.

Put that in **account settings**, or the page that works like account settings. Either of these is enough (you can offer both):

- A link to **Google Play’s Subscription Center**, for plans billed by Google Play
- Your own cancellation flow, opened directly from that screen

Play’s usual refund rule for Play Billing:

- Canceling does **not** refund the current period.
- The user **keeps access until that period ends**.
- The cancellation starts **after** the current period. They are not charged for the next one.

Some countries require a different rule: the user can cancel immediately and get a **prorated refund**. Follow the law in those countries.

You may give a **more generous** refund than Play’s default, directly to your users. If you change subscription, cancellation, or refund rules, you must tell users, and the new rules must follow the law.

**Violation:** account settings (or the equivalent screen) has no way to manage or cancel the subscription.

---

## 6. Checklist before a paywall ships

Use this on every subscription screen: promo, splash, plan picker, and trial.

**The offer**

- [ ] The amount the user will be charged is the most prominent price
- [ ] A monthly equivalent, if shown, is smaller and clearly labeled as a breakdown
- [ ] Billing period is visible (month, year, 6 months, …)
- [ ] Auto-renewal is stated in normal text, not only in a link
- [ ] It is obvious whether the app works without subscribing
- [ ] If it does, Skip / Not now / Close is visible without hunting
- [ ] Language matches the user’s locale
- [ ] Currency matches the user’s Play country
- [ ] Nothing important is behind an extra tap

**If there is a trial or intro price**

- [ ] Length is stated (for example, 7 days)
- [ ] The screen says the trial becomes a paid plan automatically
- [ ] The price and period after the trial are easy to read
- [ ] How to cancel before the charge is explained on the same screen
- [ ] The product name is not “Free Trial” or similar for an auto-renewing SKU

**The purchase path**

- [ ] The subscribe button is a deliberate action, not the same “Next” spot used on earlier screens
- [ ] Benefits listed are benefits that continue every billing period
- [ ] Any bonus is extra, not the only real value

**After they subscribe**

- [ ] Settings (or the equivalent page) links to Play’s Subscription Center and/or your cancel flow
- [ ] You do not shrink or remove the recurring benefit after purchase
- [ ] You do not cancel the user’s plan yourself to turn it into a one-time perk

**One-time products**

- [ ] Lifetime unlocks, credit packs, and single-use items are in-app products, not subscriptions

---

## 7. How this applies to WalletTrails

This section is our reading of the policy for this app. It is not extra Google text.

WalletTrails plans to stay usable for free, and to sell **Plus** and **Pro** for ongoing features (higher limits, no ads, sharing, automation). That shape fits a subscription **if** the paid features stay on for the whole billing period.

| Plan shape | What to use | Why |
| --- | --- | --- |
| Plus / Pro, billed every month or year, features stay on while paid | Subscription | Recurring value |
| A short trial of Plus or Pro, then the normal price | Subscription with a trial | Allowed if the trial screen states length, the later price, auto-charge, and how to cancel |
| Lifetime unlock, charged once | In-app product | One-time benefit. Do not sell it as a subscription |
| “Subscribe to get a one-time export, then we cancel you” | Do not do this | One-time benefit forced through an auto-renewing plan |

When the paywall is built:

- Free tracking stays available, and the offer has a clear way to dismiss it.
- The yearly plan shows the **yearly charge** as the main price. A “per month” figure can sit beside it, smaller, and labeled as a breakdown.
- Settings includes a link to Google Play’s Subscription Center for Play subscriptions.
- Prices and sentences on the offer come from Play’s localized price and the user’s language, not a single hard-coded currency.
