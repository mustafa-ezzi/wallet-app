# Google Play — Understanding subscriptions (plain language)

**What this is:** How Play subscriptions behave: what you are selling, who can get a discount, what happens when you change the price, and what happens when a renewal fails.  
**Official source:** [Understanding subscriptions](https://support.google.com/googleplay/android-developer/answer/12154973)  
**Related:** [Subscriptions policy](./subscriptions.md) · [Create and manage them in Play Console](./create-and-manage-subscriptions.md) · [Wire the app and server](./provide-subscriptions-in-the-app.md)  
**Background:** Play rebuilt subscriptions in May 2022. Older products are covered in Play’s article “Recent changes to subscriptions in Play Console.”  
**Written:** 17 October 2026  
**Status:** Product behavior. The official page and the Subscriptions policy win if they differ.

One line: **a subscription is the benefit, a base plan is the price and period, and an offer is a discount only some people can get.**

You can set this up in Play Console or with the Subscription Publishing API. A one-time charge is a separate **in-app product**, not a subscription.

---

## 1. The three objects

```text
Subscription          what they get, for a period of time
  └── Base plan       how long, how it renews, what it costs     (many allowed)
        └── Offer     a cheaper phase, only if they qualify      (many allowed)
```

People become entitled by buying a **base plan** or an **offer**, in the app or on Google Play.

| Object | Plain meaning | Example |
| --- | --- | --- |
| **Subscription** | The set of benefits | “Plus” or “Pro” |
| **Base plan** | Billing period, renewal type, and price for those benefits | Monthly auto-renew, yearly auto-renew |
| **Offer** | A discount on **one** base plan, for people who qualify | 7 days free, then the normal price |

You can sell several subscriptions in one app. Use separate subscriptions for **different benefits** (news vs sports) or **different tiers** (100 GB vs 1 TB). Use several base plans when the **benefits are the same** and only the period or renewal type changes.

Limits, per subscription:

- Up to **250** base plans and offers combined
- At most **50** of those **active** at once
- The rest must stay draft or inactive

You cannot delete a subscription, base plan, or offer, and you cannot reuse an ID. Old ones stay for reporting. Turn them inactive instead.

---

## 2. Base plans

A base plan is one combination of period and renewal type.

| Type | What the user does | Where |
| --- | --- | --- |
| **Auto-renewing** | Pays for a period. Play charges again at the end and extends access, until the user, you, or Play cancels | Your chosen countries |
| **Prepaid** | Pays for a period. It does **not** renew. They can top up to push the end date out and keep access | Your chosen countries |
| **Installments** | Gets the period, but pays a **fixed amount every month** for a commitment you set. Example: $99.99 a year sold as $8.33 × 12 months | **Brazil, France, Italy, and Spain only** |

A single “Premium” subscription can have a monthly auto-renew plan, a monthly prepaid plan, and a yearly auto-renew plan at the same time.

**Prepaid top-up** can be a different length from the original. Someone on a one-month prepaid plan can buy a one-year prepaid top-up for the same subscription. They can also switch between prepaid and auto-renewing, in the app or in Play’s Subscription Center.

**Installments** are always monthly. Nobody can change how often those charges fall. You are paid as each month is paid, not the whole commitment on day one. A price change, or a user cancellation, takes effect at the **end of the commitment**, not in the middle of it.

### Fields you set

| Field | Meaning |
| --- | --- |
| Billing period | How long that payment covers |
| Renewal type | Auto-renew, prepaid, or installments |
| Regional availability | Which countries, and the price in each. You can also opt in to countries Play adds later |
| Grace period | After a failed renewal, how long they **keep** access while Play retries |
| Account hold | After grace, how long Play may still retry while they **must not** have access. If this ends unpaid, the subscription expires |
| Base plan and offer changes | When they are charged if they switch to **this** plan or one of its offers **while already on this same subscription**. This setting does **not** apply if they switch to a different subscription |
| Resubscribe | If on, someone whose auto-renew plan has **expired** can buy it again from the Play Store |
| Tags | Optional labels, up to **20**, each up to **20 characters**. The API can see them. Users cannot. Use them to pick which offer to show when several match |

---

## 3. Offers

Anyone can buy a base plan. An offer is only for people who pass the rules you set. It is one or more cheap or free phases. When those phases end, the subscription renews at the **base plan price**.

The concepts page says offers can be created only on **auto-renewing** base plans. The create-subscriptions page also mentions attaching an offer to an installments plan. If the Console will not add the offer, it is not available for that plan.

The same concepts page still says how phases would count on an installments plan, if you have them:

- A **free trial does not** count as part of the commitment.
- An **intro-price phase does** count. Three discounted payments use up three of the committed payments.

### Who qualifies

| Rule | Who Play lets in | Bought outside your app? |
| --- | --- | --- |
| **New customer** | Never had **this** subscription, **or** never had **any** subscription in the app. You pick which | Yes, if Play agrees they qualify |
| **Upgrade** | Already has a subscription you name. Optional: only a certain billing period (default is any period). **Redemption cap:** how many times they may claim it | Yes, if Play agrees they qualify |
| **Developer determined** | Your app decides. Second-chance trials and win-backs live here. Play does not check | **No.** Only inside your app. Featured Play listings cannot use this rule |

### Phases

An offer has one or more phases. Example: 7 days free, then one month at $2, then the normal price.

**Free trial.** A number of days, weeks, or months at no charge. From **3 days to 3 years**.

**Introductory price.** A discount for a fixed time. The price must be **equal to or lower than** the base plan. Play also enforces its min and max price for that country. Three ways to set it:

- A fixed amount, such as $5
- An amount off, such as $5 off
- A percent off, such as 50%

A percent or “amount off” is easier later, because it follows the base price. The Play purchase sheet does **not** currently show that comparison (no crossed-out base price).

How the intro phase bills:

- **Single payment:** one charge covering a number of days, weeks, or months
- **Multiple payments:** the discount repeats for **1 to 52** billing periods of the base plan

### Offer fields

- **Regions** start as the base plan’s list. You may shrink that list. You cannot add a country the base plan does not have.
- **Tags** work like base-plan tags. When the API returns an offer, it includes the offer’s tags **and** the base plan’s tags. Tag developer-chosen offers (for example `WINBACK-50-OFF`) so the app can tell them apart.

### Play may strip the discount

Play can detect someone trying to get a trial or intro price they do not qualify for. They can still buy the **base plan**, at the normal price, with no trial and no intro phase.

### States

| Object | Draft | Active | Inactive |
| --- | --- | --- | --- |
| Subscription | Still being defined. Its plans and offers are draft too | Exists. New purchases only if some base plan is active. Existing buyers keep access | — |
| Base plan or offer | Not for sale yet | New and existing purchases | No **new** purchases. People already on it continue until they cancel |

You can turn a base plan or offer from active to inactive and back.

---

## 4. Examples

These match Play’s samples. Prices are theirs, not ours.

**Monthly, anyone.** One auto-renewing monthly base plan, no offer. Benefits such as “unlimited” and “no ads.” Price per country. Grace period 7 days.

**Free trial for new people.** Same monthly plan, plus an offer:

- Eligibility: never had any subscription in this app
- Regions: a subset (their sample uses the US and Canada, and leaves Türkiye on the full price only)
- Phase: 7-day free trial, then the base price
- Anyone who already had a subscription in the app does not see the trial. They can still buy the base plan

**Trial, then a cheap month.** Same eligibility and regions. Phase 1: 7 days free. Phase 2: one month at a fixed low price ($1.99 in their sample). Then the base price.

**Win-back, decided by the app.** Developer-determined offer, US and Canada only. Three billing periods at 50% off, tag `WINBACK-50-OFF`. The app chooses who sees it (for example people who already canceled). After three periods, the base price. This offer cannot be sold on the Play Store page.

---

## 5. Changing the price

The new price applies **immediately** to new purchases, including prepaid top-ups.

If you change an **auto-renewing** base plan price, everyone still on the old price becomes a **legacy price cohort**. They keep the old price until they switch plans, or until you end that cohort. Every price change creates a new cohort.

Ending a cohort:

- Moves those people to the **current base plan price** only. You cannot send them to some other number.
- Does **not** change an offer phase they already bought.
- Also ends every **earlier** cohort of that same base plan.

**A lower price** does not need the user’s approval. They are told, and the lower price is charged on a renewal. Play may authorize the renewal up to **48 hours** early, or up to **5 days** early in **India and Brazil**. Someone already authorized at the old higher price is not immediately re-charged the lower one. The lower price waits until the **following** renewal.

**A higher price** is either opt-in or opt-out.

| | Opt-in | Opt-out |
| --- | --- | --- |
| What the user must do | Agree. If they do not, Play **cancels before the first higher charge** | Nothing. They can cancel if they want. Otherwise the next renewal after the notice is the new price |
| Notice | At least **30 days**. The next charge may still be the old price | At least **30 or 60 days**, depending on the country. Extra renewals may still be at the old price |
| When you can use it | Always, for a rise that is not opt-out | Only if **every** rule below is true |

Opt-out is allowed only if all of these are true:

- The country is one Play supports for opt-out, and the developer account is in good standing. Minimum notice depends on the country (Play’s country list).
- That base plan has had **no other opt-out rise in that country in the last 365 days**.
- The rise is no more than the **greater** of: **50%** of what that user pays now, or **17 US cents per day** (converted to local currency).
- You certify in Play Console that the app’s terms allow a price rise by advance notice, and that the terms give a clear, valid reason.
- At least **30 days** before it takes effect, every affected user sees a prominent **in-app** notice with: subscription name, old price, new price, the date the new price starts by itself, and how to cancel.
- That notice is on **every device type** where the app exists (phone, TV, streaming). A watch notice is recommended, not required.

If any rule fails, use opt-in, or leave the cohort on the old price. Do one price change at a time. If you stack them, the user only has to answer the **latest** one. That applies to opt-in rises, opt-out rises, and cuts.

Test a price change with the **Play Billing Lab** app and license testers so real subscribers are not moved.

---

## 6. Failed renewal

Play asks the user to fix the payment and retries.

1. **Grace period.** They **keep** access.
2. **Account hold.** They **must not** have access. Play may still retry.
3. If hold ends unpaid, the subscription **expires**.

Default for auto-renewing plans: account hold is on, length **60 days minus the grace period**. You can shorten or disable hold. Grace plus hold must add up to **at least 30 days**. Shorter than the default recovers fewer failed payments.

If the subscription has **add-ons** and a renewal fails, Play uses the active item with the **shortest grace period**, and that item’s hold. If several items share that shortest grace but have different holds, Play uses the **longest** of those holds.

---

## 7. Pause, cancel, and a $0 resubscribe

**Pause** is one switch: **Monetize with Play > Monetization setup > Subscription settings > Pause > Enabled > Save.**

Eligible users then see Pause in the Subscription Center and in the cancel flow. They can pause for **one week to three months**, depending on the billing period, instead of canceling.

- **Yearly plans cannot be paused.**
- **Free trials cannot be paused.**
- Pause starts only after the current paid period ends.
- While paused, they have **no** access.
- When it ends, Play tries to charge. Success turns access back on.

**Cancel.** Account settings (or the equivalent screen) must offer an easy online way to cancel: a link to Play’s Subscription Center, or your own cancel flow, or both. Detail is in [subscriptions.md](./subscriptions.md).

**They cancel, then change their mind before the period ends.** Access already runs to the end of the period they paid for. If they tap Resubscribe in Play before that end:

- Play restores the subscription and creates a **$0.00** order
- They are not charged again for the current period
- The next real charge is the **original** renewal date

---

## 8. Checklist

- [ ] Different benefit tiers are different subscriptions. Monthly and yearly of the same tier are base plans
- [ ] Under 50 active plans and offers per subscription
- [ ] IDs will never be reused, because they cannot be deleted
- [ ] Trials and intro prices are offers, and the intro price is not above the base price
- [ ] A win-back offer is developer-determined, tagged, and only sold inside the app
- [ ] Grace plus account hold is at least 30 days, and access is off during hold
- [ ] A price rise is opt-in unless every opt-out rule, including the in-app notice, is met
- [ ] A $0 resubscribe before expiry is not treated as a new sale
- [ ] Yearly plans are not offered a pause

---

## 9. How this applies to WalletTrails

Plus and Pro are different benefit tiers, so they are **two subscriptions** if both ship. Monthly and yearly of one tier are **base plans of that subscription**, not two unrelated products. The server today still treats `premium_monthly` and `premium_yearly` as separate product IDs. Pick the Console shape before creating IDs. IDs cannot be reused. See [create-and-manage-subscriptions.md](./create-and-manage-subscriptions.md).

`premium_lifetime` stays a one-time in-app product.

A trial is an offer phase (3 days to 3 years), not a sentence in the subscription name. After the phases, billing is the base plan price. People who do not qualify, or whom Play blocks, can still buy that base plan at full price.

If we later raise a price, existing subscribers stay on the old price until we end that cohort. The safe rise is **opt-in**. Opt-out needs the terms of service, a 30-day in-app notice, and Play’s country, frequency, and amount caps.

If Play sends a **$0.00** order because someone resubscribed before the period ended, the server should keep the same expiry. It should not start a new period and it should not treat it as a new payment. During account hold, Plus / Pro must be off even though the first purchase was valid.
