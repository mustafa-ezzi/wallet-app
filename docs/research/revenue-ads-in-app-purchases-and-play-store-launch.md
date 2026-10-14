# WalletTrails — Revenue Models, Ads, In-App Purchases & Play Store Launch

**Document type:** Deep research (strategy, not an implementation spec)  
**Product:** WalletTrails — international personal finance + household expenses (multi-currency; Android + web)  
**Primary store:** Google Play (`com.wallettrails.app`), **worldwide** availability (minus Play-restricted countries)  
**Also:** Web app + marketing site; iOS is a later store, not a day-one dependency  
**Reviewed:** 18 September 2026 (future Premium roadmap added)  
**Status:** Research and recommended direction. Public paywall / ads should stay off until the chosen model is configured.

This file answers five questions:

1. How can WalletTrails make money (free, paid, hybrid) for a **global** user base?
2. How do ads (AdSense / AdMob) actually work for this category, **by region**?
3. How should in-app purchases work, and what fees will Google take **by country**?
4. How should the first Play Store launch be sequenced internationally, given how Spendee and peers launched?
5. What **future** features should we build for paying users (without turning Free into a demo)?

**Recommended direction in one line:** Launch as a **generous free finance app** (hybrid Model C) in **all Play countries** you can support, keep core tracking free forever, sell **Plus** and **Premium** with a **USD list price + Play regional pricing**, use **AdMob on Android + AdSense on the marketing/blog site**, and do **not** put ads on money screens.

The backend already has the skeleton for this: premium entitlements, Play Billing verification, staff grants, promo codes, and remote ad config (`premium_monthly` / `premium_yearly` / `premium_lifetime`, `premium_hides_ads`). This document is about *what to sell and how to launch*, not about writing that code again.

---

## 0. What we are selling (and what we are not)

WalletTrails is a **record-keeping and planning app** for people anywhere who hold cash and bank accounts, split costs, and want a forecast—not only a history. It is not a bank, wallet, lender, or payment rail. Users enter or approve their own data (including bank-SMS *suggestions* where that feature exists). That constraint is a revenue constraint too:

| We can charge for | We should not promise or sell as if we were |
| --- | --- |
| Time saved (import, reminders, reports) | Live bank feeds from every institution on day one |
| Organization (unlimited wallets, budgets, history) | Moving money between people or banks |
| Sharing (Household extras, People, travel) | Investment advice or credit scoring |
| Peace of mind (no ads, privacy extras, export) | Selling user ledger data to advertisers |

Finance apps that last do **not** sell “the ability to add an expense.” They sell **automation, limits, sharing, and a clean experience**. Spendee, Goodbudget, Money Lover, and Wallet by BudgetBakers all follow that pattern—and they all sell **globally** with **local store prices**.

**International product implications**

- **Home currency is the user’s**, not a single national currency. Onboarding already captures country and preferred currency; treat that as the default ledger, with Travel Mode for foreign spend.
- **Automation will differ by market.** Bank SMS / notification import is strong in countries where banks still SMS every debit (South Asia, parts of SEA, Middle East, Africa). Open-banking / aggregator sync (Plaid, TrueLayer, Salt Edge, etc.) is the Spendee/YNAB wedge in the US/UK/EU—and is a **later Premium module**, not a launch lie.
- **Willingness to pay follows GDP and Play norms**, not one price in one currency. Competitors publish a **USD list** and let Google **localize** (EUR, GBP, INR, PKR, BRL, …). WalletTrails should do the same: **one SKU, many regional prices**.

### 0.1 Market tiers (for pricing, ads, and launch energy)

Use three tiers. Users in every tier get the **same app and the same plans**; only **list price, ad eCPM, and which automation you emphasize** change.

| Tier | Examples | Typical finance-app willingness to pay | AdMob eCPM (indicative, 2025–26) |
| --- | --- | --- | --- |
| **T1 — High ARPDAU** | US, Canada, UK, Ireland, EU/EEA, Switzerland, Nordics, Australia, New Zealand, Singapore, UAE, Saudi Arabia, Japan, South Korea | Spendee Plus–Premium band ($2–$6/mo) is normal | Banners ~$0.30–$2; interstitials ~$3–$20; rewarded much higher |
| **T2 — Mid** | Eastern Europe, Turkey, Brazil, Mexico, Argentina, Malaysia, Thailand, South Africa, Chile | Need **regional prices** ~40–70% of USD list or conversion collapses | Between T1 and T3 |
| **T3 — Volume / low eCPM** | India, Pakistan, Bangladesh, Indonesia, Philippines, Nigeria, Egypt, Vietnam | $1.99–$5.99/mo feels expensive; yearly + aggressive localization wins | Banners often **$0.08–$0.40**; PK/IN banners frequently **&lt;$0.20** |

**Revenue mix reality:** a few thousand T1 yearly subscribers can out-earn tens of thousands of T3 banner impressions. Still ship T3: volume, reviews, Household network, and diaspora users (T3 family + T1 earner in one Household).

Do **not** ship a Pakistan-only or India-only SKU as the product identity. Ship **one international product** with localized currency, copy, and Play prices.

---

## 1. How apps in this category launched and how they charge

This section is the competitor research. The pattern is remarkably consistent: **free manual tracking first, paid automation later**, sold **worldwide** through App Store / Play with **country-specific prices**.

### 1.1 Pattern that almost everyone uses

| Stage | What they ship | What they charge for |
| --- | --- | --- |
| 1. Acquisition | Manual expense + wallet + simple reports | Nothing (or ads) |
| 2. Habit | Daily logging, budgets, reminders | Soft limits (1 wallet, 1 budget, 4 expenses/day) |
| 3. Conversion | Bank sync, unlimited, shared wallets, no ads, AI scan | Subscription (monthly + yearly, sometimes lifetime) |
| 4. Retention | Cross-device sync, household, exports, support | Annual plan (biggest cash) |

Almost nobody launches as a paid-download finance app anymore. YNAB is the exception: it is **trial then full price**, no permanent free tier—and it still localizes price and offers a student year.

### 1.2 Spendee (closest visual / “wallet” competitor)

**How they launched**

- Started as a well-designed **manual** expense tracker (iOS then Android).
- Grew on App Store / Play **feature** placements and design awards (Mobile UX Awards 2017; featured listings).
- Only after users already tracked cash did they add **bank connections** as the Premium wedge (2,500+ banks—**international aggregator**, not one country).
- Subscriptions are sold **only inside the mobile apps** via App Store / Google Play (their help centre is explicit). Web is a companion, not the checkout.
- Public site shows **USD**; they warn **prices differ by country and tax**.

**How the paid model works (public 2025–2026 pricing, USD list; local store prices vary)**

| Plan | Typical USD list | What you get |
| --- | --- | --- |
| **Basic (free)** | $0 | 1 cash wallet, 1 budget, manual tracking, security. No bank sync. |
| **Plus** | **$1.99/mo** or **$14.99/yr** (~49% off yearly) | Unlimited wallets & budgets, shared wallets. Still **no** bank sync. |
| **Premium** | **$5.99/mo** or **$35.99/yr** | Everything in Plus **plus** bank / e-wallet / crypto connect, auto-import, auto-categorize, Magic AI receipt scan. |
| **Lifetime / NFT** | Store-listed lifetime SKUs (e.g. ~$59.99 Premium lifetime on some App Store locales); they also experimented with a resellable NFT license | Pay once; ongoing bank-sync cost is why most peers moved *away* from lifetime |

**7-day free trial** on paid plans.

**What to copy**

- Free plan must be *usable*, not a demo.
- Two paid tiers: **organization/sharing** vs **automation**.
- Yearly is ~40–50% cheaper than 12 months.
- The expensive feature is **automatic import**, not “add expense.”
- **One global product**, USD marketing price, store-localized checkout.

**What not to copy blindly**

- Bank sync at Spendee Premium prices assumes US/EU/global open-banking vendors. WalletTrails should not fake that. Launch automation = **SMS / share-sheet / paste import + categorization**. Add **aggregator bank sync as a Premium add-on or Premium-only module per region** when a vendor and compliance budget exist.
- Do not use a single emerging-market price as the world list; T1 users will underpay and T3 users will still bounce if you only show $5.99.

### 1.3 Wallet by BudgetBakers

- Freemium. Manual tracking free; **Premium ~$5.99/mo**, **~$35.99/yr**, sometimes a lifetime SKU.
- Wedge: **bank links in 15,000+ institutions**, **multi-currency**, dashboard customization.
- Launch story: Czech/European product, **global** bank-aggregator positioning.

**Lesson:** International finance apps win on **multi-currency + travel + many account types**, not on one local bank brand. WalletTrails already has Travel Mode and wallet types—those are global Plus/Premium stories. Do not compete on “we connect every bank” until you actually do.

### 1.4 Money Lover

- Strong in **Southeast Asia**, also listed globally.
- **Lifetime Premium** commonly listed around **$19.99** (unlocks features, no ads).
- **Linked Wallets** (actual bank connect) is a **separate monthly** add-on (~$2.99/mo), because bank aggregators have ongoing cost **and only exist in some countries**.

**Lesson:** Split “pretty app, no ads, extra wallets” (cheap sub) from “automation that costs us money every month” (subscription, **region-gated**). SMS parsing, future Plaid, and receipt AI all belong on **recurring Premium**, not lifetime.

### 1.5 Money Manager (Expense & Budget)

- Almost everything **free**: unlimited accounts/categories. Global Play listing, enormous install base.
- They charge mainly for **cloud sync** (~$2.49/mo in some listings).
- Launch: years of Play Store ASO as a simple tracker; monetize the one thing that costs servers.

**Lesson:** A huge free surface builds **international reviews**. Charge the **sync / multi-device / family / automation** layer. WalletTrails already syncs by default (account-based), so our paid wedge cannot be “sync” alone unless we later add a device cap.

### 1.6 Goodbudget

- Envelope method. **Genuinely useful free tier** (10 + 10 envelopes, 1 account, 2 devices, 1 year history). **No ads** on free.
- **Premium ~$10/mo or $80/yr**: unlimited envelopes/accounts, 5 devices, 7 years history, **US bank sync** (feature is **geo-limited**; the app is still global).

**Lesson:** Limits on **count and history** convert without making the free user feel cheated. **Bank sync can be US/EU-only** while the rest of the app is worldwide. Ads are optional; trust can be the brand.

### 1.7 Splitwise (sharing analog to Household)

- Free groups and splits built a **global** network effect (100+ currencies).
- Later: **ads + 4 expenses/day cap** on free.
- **Pro ~$4.99/mo or $39.99/yr** (US list; local varies): no ads, no daily cap, receipt scan, currency conversion, charts, search. Annual includes a Trip Pass. Payments integrations are **country-specific** (Venmo/PayPal US, Paytm India).

**Lesson:** Household/People is a **cross-border growth engine** (roommates, trips, diaspora families). Do not lock “create a household” on day one. Lock **receipts, extra members, extra ledgers, trip-grade extras**. Currency conversion on shared expenses is a **Premium/Travel** feature internationally.

### 1.8 PocketGuard

- Freemium; **Plus ~$12.99/mo or $74.99/yr** after 7-day trial.
- Wedge: **US/Canada bank connect**, “what’s left to spend,” bill negotiation.
- High price is viable **only** where bank aggregation is the product. Copy the **clarity of “what’s left”**, not the US-only price, for a global manual+SMS app.

### 1.9 YNAB (paid-only model)

- 2004: sold an Excel spreadsheet.  
- 2006: desktop **YNAB Pro ~$39.95 one-time**.  
- **30 Dec 2015:** switched to SaaS.  
- 2026: **$14.99/mo or $109/yr**, **34-day trial**, no permanent free tier. Student year free. Bank connection is **regulated by country** (e.g. TrueLayer in the UK).

**Lesson:** Paid-only works only with **cult teaching, huge trial, and high T1 willingness to pay**. Wrong for a **first Play listing against 50 free trackers**. Revisit a YNAB-priced SKU only if WalletTrails becomes a known method internationally.

### 1.10 Competitor scorecard (what they gate)

| App | Free usable? | Ads? | Paid wedge | USD price band | Geographic note |
| --- | --- | --- | --- | --- | --- |
| Spendee | Yes, but 1 wallet / 1 budget | Generally no (subs fund the app) | Bank sync, unlimited, shared, AI scan | $2–$6/mo | Global app; banks vary by country |
| Wallet (BudgetBakers) | Manual yes | Low / none | Bank sync, premium UI | ~$6/mo | Global aggregators |
| Money Lover | Yes | Yes on free | Lifetime premium + monthly bank link | ~$20 life + $3/mo link | SEA-strong; linked banks regional |
| Money Manager | Very yes | Light | Cloud sync | ~$2.50/mo | Global ASO machine |
| Goodbudget | Yes, limited counts | No | Unlimited + bank + history | $10/mo | Bank sync US-centric |
| Splitwise | Yes, then caps | Yes | Caps, ads, receipts | $5/mo | Global; payout rails local |
| PocketGuard | Limited | — | Full product | $13/mo | US/CA banks |
| YNAB | Trial only | No | Entire product | $15/mo / $109/yr | Global SaaS; AIS licensed per region |

**Category takeaway for WalletTrails**

1. Launch **free** on Play Store **worldwide**. Paid download kills installs in Finance in every country.
2. Gate **automation and limits**, not the first wallet and first expense.
3. Use **monthly + yearly** with **regional prices**; treat **lifetime** as a promo only.
4. **Household** is Splitwise-like growth — keep the entry free; it crosses borders.
5. **Import automation** is the Spendee-Premium equivalent: SMS/share/paste at launch; **open-banking later, per region**.
6. Price like Spendee **in T1**, localize down in T2/T3 the way Google Play already does for those peers.

---

## 2. Three business models for WalletTrails

These are complete strategies, not just price lists. You pick **one** as the public default. Hybrid (Model C) is the recommended default; A and B are documented so the tradeoffs are explicit. All three assume **international distribution**.

### Model A — Free model (ads + optional tips)

**Idea:** App is 100% free. Revenue from ads (and later affiliate / sponsored education). No feature paywall.

**Who it fits:** Fastest install growth; students; T3 users who will not pay $2–$6/month; a traffic engine for the website.

**Revenue stack**

1. **AdMob** inside Android (banners, rare rewarded, **no** interstitials on money flows). eCPM will be **dominated by T1 users** even if T3 is most of the installs.
2. **AdSense** on wallettrails.com / blog / help (English first, then localized articles). T1 search traffic is where AdSense RPM is real.
3. Optional: Play **tips** / “support the developer” one-time SKU (not a feature unlock)—works poorly except a few T1 fans.
4. Optional later: **compliant** affiliates (e.g. education, FX cards) — never fake “financial advice,” never sell ledger data.

**Pros**

- Highest download rate and review volume **globally**.
- No Play Billing review complexity on day one.
- Matches Play Finance category norms (most peers are free-to-install).

**Cons**

- **eCPM is extremely uneven.** Same banner: US may be ~$0.50–$2.00; India/Pakistan often ~$0.08–$0.20. A 100% T3 audience will not fund hosting.
- Ads on a **money** app destroy trust if they sit on balances, PINs, or confirm screens. Product guide already forbids that. That is true in every country (worse in markets with banking-malware ads).
- Google Publisher Policies **forbid targeting ads from sensitive financial status** (debt, low credit, detailed finances). You will get **generic** ads, not high-CPM finance ads. Fill rate may be weaker than a game **everywhere**.
- AdSense **minimums** ($100 USD typical payout) mean months of zero cash if the site is thin.
- You train users that the product is “worth $0,” which makes a later paywall feel like a betrayal (Splitwise backlash pattern)—this happened to a **global** user base, not one country.

**Rough math (order of magnitude, not a forecast)**

*T3-heavy (e.g. 10,000 MAU, eCPM $0.20, 8 sessions, 2 banners):*  
`10,000 × 8 × 2 / 1,000 × $0.20 ≈ $32/month` before the $100 payout.

*Mixed (2,000 T1 MAU at $1.00 eCPM + 8,000 T3 at $0.20, same impressions/user):*  
T1 = `2000 × 8 × 2 / 1,000 × $1.00` = **$32**; T3 = `8000 × 8 × 2 / 1,000 × $0.20` = **$25.60**; total ≈ **$58/month**. Still tiny.

*T1-heavy (10,000 MAU at $1.00 eCPM):* ≈ **$160/month** on this conservative banner setup. Interstitials would raise this and **destroy ratings**.

**Verdict:** Use as a **phase**, not a forever strategy. Fine for the first 3–6 months of Play listing **if** ads are sparse. Insufficient as the only plan **even with US users**, unless you accept game-like ad density (we should not).

---

### Model B — Paid model (subscription or paid app, no ads)

**Idea:** No ads. Either (B1) paid download or (B2) free download + mandatory subscription after trial — YNAB-style. Same SKUs worldwide.

**B1 — Paid APK on Play ($0.99–$4.99)**

- Finance users compare 50 free apps in **every** locale. Paid download **kills ASO**.
- No try-before-buy except Play’s refund window.
- One-time price **never** covers ongoing import, push, hosting, and future aggregator fees.

**B2 — Trial then subscribe (YNAB-style)**

- 14–34 days full app, then pay or read-only.
- Highest revenue **per paying user** in T1.
- Conversion on unknown brands is often **&lt;2% of downloads** globally; worse in T3. Most people churn at the paywall and leave a 1-star review **in the same listing** that T1 users see.

**Pricing if we did Model B (USD list; Play localizes)**

| SKU | USD list | Notes |
| --- | --- | --- |
| Monthly | $4.99–$9.99 | T3 will convert poorly without a cheaper regional price |
| Yearly | $29.99–$59.99 | Still below YNAB; above Spendee Plus |

**Pros**

- Clean brand, no ad policy risk—valuable for a **global finance** brand.
- Simple: user is premium or not (one entitlement travels across countries).
- Matches “money app should feel private.”

**Cons**

- Slow install curve; competitors are free in all markets.
- Support load from “I didn’t know I’d have to pay” in many languages.
- Play reviewers need a test account that bypasses the paywall (checklist already notes this).

**Verdict:** Do **not** launch Model B on day one. Keep it as a **future “WalletTrails Pro-only”** if the brand becomes internationally known.

---

### Model C — Hybrid model (recommended)

**Idea:** Free forever for core personal finance **in every country**. Light, trust-safe ads on free users (eCPM will come mostly from T1). Two paid subscriptions that remove ads and unlock automation / higher limits. **USD list + regional Play prices.** Web can show AdSense; Android uses AdMob.

This is Spendee + Splitwise + Money Lover, adapted to **SMS/share import first** and **open banking later**, for a worldwide audience.

**Revenue stack (priority order)**

1. **Subscriptions (Plus + Premium)** — primary, **especially T1 yearly**.
2. **AdMob** on free Android users — secondary, with kill switch; **do not depend on T3 banners**.
3. **AdSense** on marketing site / guides in **English + later locales** — SEO and T1 RPM.
4. **Lifetime** — launch or seasonal promo (New Year, Black Friday, Ramadan, Diwali) **capped quantity**.
5. **Promo codes** — influencers, closed testers, press, staff comps (already in admin).

**Why this fits WalletTrails**

- Infrastructure already assumes `is_premium` and `premium_hides_ads`.
- Household/People need a free graph to grow **across countries**.
- Import automation has real cost → belongs on Premium.
- International users will try free; T1 will pay Spendee-like prices; T2/T3 will pay if Play shows a **local** number they recognize.

**North-star economics (planning targets, not promises)**

| Metric | Year-1 target to treat the model as working |
| --- | --- |
| Play distribution | **Worldwide** (or all countries you legally support) |
| Free → any paid | **2–5%** of MAU who stay 4+ weeks (**higher in T1**, lower in T3) |
| Mix of payers | ~70% yearly, ~25% monthly, ~5% lifetime/promo |
| Revenue by user geo | Expect **majority of $ from T1** even if majority of MAU is T2/T3 |
| Ads | &lt;20% of revenue once subscriptions exist |
| Review rating | ≥4.3 **globally** (ads must not tank this) |

---

## 3. The three customer plans (feature matrix)

These are the **product plans** to put on a pricing page and in the Play IAP SKUs. Names: **Free / Plus / Premium** (Spendee-shaped, already familiar worldwide).

**Design rules**

1. A person can run **personal money in their home currency** on Free forever (wallets, income, expenses, transfers, bills, one budget, privacy lock, reminders).
2. Plus is for **power organization + sharing + no ads**.
3. Premium is for **automation** (import inbox, smarter suggestions, travel pack, exports, priority support; later bank sync **where available**).
4. Never gate: account creation, privacy hide-amounts, basic reminders, adding a transaction, viewing own balances.
5. Soft-cap with an upgrade sheet, not a hard crash: “You’ve used 2 of 2 free wallets.”
6. Same feature matrix **in every country**. Do not ship a “cheap country gets fewer features” app—that becomes a support and review nightmare. **Price** localizes; **plans** do not.

### 3.1 International list prices (USD) and regional Play prices

Create **one set of Play products**. Set a **USD default**, then use Play Console **regional pricing** (and Google’s pricing templates) so a user in Germany sees EUR, in India INR, in UK GBP, etc.

**USD list (marketing + T1 default) — start at Spendee parity**

| Plan | Monthly | Yearly (≈ % vs 12× monthly) | Lifetime (promo) |
| --- | --- | --- | --- |
| **Free** | $0 | — | — |
| **Plus** | **$1.99** | **$14.99** (~37% off) | optional ~$39.99 |
| **Premium** | **$4.99** (or $5.99 to match Spendee) | **$34.99** (or $35.99) | optional ~$59.99–$79.99 |

**7-day trial** on Plus and Premium (Play offer; one trial per Google account).

**Suggested regional multipliers on the USD list** (starting point—tune after 90 days of real conversion):

| Tier | Monthly Plus | Yearly Plus | Monthly Premium | Yearly Premium |
| --- | --- | --- | --- | --- |
| T1 (US, UK, EU, AU, CA, SG, AE, SA, JP, KR, …) | $1.99 | $14.99 | $4.99–$5.99 | $34.99–$35.99 |
| T2 | ~$0.99–$1.49 | ~$9.99–$11.99 | ~$2.99–$3.99 | ~$19.99–$24.99 |
| T3 | Play’s lowest credible Plus (~$0.49–$0.99) | ~$4.99–$7.99 | ~$1.49–$2.49 | ~$9.99–$14.99 |

Google will convert to local currency and add **VAT/GST** on top in many countries. The in-app sheet is the source of truth; the website should say **“prices vary by country and tax.”** Same sentence Spendee uses.

**Do not** maintain a separate “Pakistan SKU” vs “US SKU” with different product IDs unless Play requires it. One `plus_monthly` / `premium_yearly` globally, regional prices underneath.

### 3.2 Plan definitions

#### Free — “Follow every rupee / dollar / dirham”

**Price:** $0 everywhere  

**Promise:** Honest personal tracker. Good enough for someone with one bank + cash in **any** currency.

| Area | Free allowance |
| --- | --- |
| Personal wallets | **2** (e.g. 1 bank + 1 cash) |
| Transactions | Unlimited (do **not** copy Splitwise’s 4/day — it punishes logging) |
| Categories | Default set + a small custom cap (e.g. **10** custom) |
| Income sources | **2** active |
| Monthly costs / payables / receivables | **3** combined active bills/loans |
| Budgets | **1** category budget **or** 1 overall cap per month |
| Reports | Current month + **previous 1 month** |
| Forecast | Basic expected in/out for this month |
| Export | None (or watermarked 7-day sample) |
| Household | **1** household, **1** ongoing ledger, **up to 3 members**, no event ledgers |
| People | **1** linked person |
| Travel Mode | Off (or 7-day trial) |
| Import | **Paste / share one message or statement snippet at a time**. No always-on SMS/notification inbox. Lifetime cap e.g. **15 approved imports** as a taste. |
| Themes | Default theme only |
| Ads | Yes, non-sensitive placements |
| Support | In-app thread, standard queue (English first) |
| Devices | **2** logged-in devices |
| History | Full personal history (don’t delete old txs — that’s hostile). Limit *report range* instead. |
| Home currency | User’s chosen currency; not locked to one country |

#### Plus — “Household & clarity”

**Price:** USD list **$1.99/mo** or **$14.99/yr** (+ regional prices in §3.1)

**Promise:** Unlimited personal organization, serious Household, no ads. Still **manual-first** (no always-on import inbox).

| Area | Plus |
| --- | --- |
| Wallets | **Unlimited** |
| Custom categories | Unlimited |
| Income / bills / loans | Unlimited |
| Budgets | Unlimited categories + overall cap + copy-from-last-month |
| Reports | Full history, category breakdowns, wallet filter |
| Export | **CSV** (personal + household) |
| Household | Unlimited members (fair cap e.g. 15), **event ledgers**, close-event, CSV |
| People | Unlimited links |
| Travel Mode | **Premium-only** so Plus stays cheap (travel is a T1 conversion lever) |
| Import | Paste + share-sheet, higher cap (e.g. **80/month**), still no always-on inbox |
| Themes | All themes |
| Ads | **Off** |
| Support | Standard, faster than Free |
| Devices | **5** |
| Widget | Balance widget unlocked if you ever gate it |

#### Premium — “Automation”

**Price:** USD list **$4.99–$5.99/mo** or **$34.99–$35.99/yr**; lifetime **promo only**

**Promise:** Least typing. Import inbox where the OS allows it, smarter matching, travel, PDF, priority help. Later: **bank aggregation in countries where you have a vendor**.

| Area | Premium (everything in Plus, plus) |
| --- | --- |
| Import inbox | Android SMS and/or notification listener **where Play policy and the OS allow**; web review of the **same** queue. Fallback everywhere: share-sheet + paste + file import (CSV/OFX later). |
| Classification | Wallet aliases, ATM vs expense rules, reversal linking, custom overrides |
| Caps | Generous or unlimited approved imports |
| Travel Mode | Full (original foreign amount + home-currency books, rates) |
| Export | CSV **and PDF** reports |
| Insights | “Wallet intelligence” / extra forecast comparisons when Phase 4 ships |
| Bank sync (future) | **Region-gated** Premium module when live (US/EU/UK first). Never advertised globally until live. |
| Ads | Off |
| Support | **Priority** queue |
| Devices | Unlimited reasonable use (e.g. 8) |
| Early features | Flag-gated betas |

**SMS is not “Pakistan-only.”** It is a **Premium capability in markets where banks SMS**. In the US/UK, the same Premium user still gets travel, PDF, caps, and (later) aggregator sync. Do not make Premium useless in T1 because SMS is rare there.

### 3.3 Side-by-side matrix

| Feature | Free | Plus | Premium |
| --- | --- | --- | --- |
| Add income / expense / transfer | Yes | Yes | Yes |
| Any home currency | Yes | Yes | Yes |
| Privacy lock / hide amounts | Yes | Yes | Yes |
| Offline personal entries | Yes | Yes | Yes |
| Reminders (bills) | Yes | Yes | Yes |
| Wallets | 2 | Unlimited | Unlimited |
| Budgets | 1 | Unlimited | Unlimited |
| Bills / loans / receivables | 3 active | Unlimited | Unlimited |
| Report history | 2 months | Full | Full |
| CSV export | No | Yes | Yes |
| PDF export | No | No | Yes |
| Household | 1 group, 3 people, ongoing only | Full + events | Full + events |
| People links | 1 | Unlimited | Unlimited |
| Travel Mode | No | No | Yes |
| Manual paste/share import | Limited | Higher | Unlimited |
| Auto inbox + web queue | No | No | Yes (where OS allows) |
| Bank aggregator sync | No | No | Future, per country |
| Themes | Default | All | All |
| Ads | Yes | No | No |
| Support | Standard | Standard+ | Priority |
| Trial | — | 7 days | 7–14 days |

### 3.4 Why this split will convert (globally)

- **Free → Plus:** third wallet, spouse/roommate Household, or ad fatigue. Same in Lagos, Lahore, and London.
- **Free/Plus → Premium:** travel, import inbox, or (later) bank connect. T1 especially pays for **time**; T3 pays when SMS saves daily typing.
- Logging stays unlimited so power users don’t rage-quit (avoid Splitwise’s daily cap unless abuse appears).

### 3.5 What **not** to put behind paywall

- Biometric / PIN / screenshot protection  
- Accuracy of balances  
- Ability to delete account / export *personal data* (GDPR/CCPA/UK GDPR legal export ≠ fancy PDF report)  
- Security patches  
- Choosing country and currency  

### 3.6 Future features for paying users

Launch Plus/Premium with the matrix in §3.2–3.3. After that, **new work should mostly land on Plus or Premium** so yearly subscribers keep a reason to renew. Free stays a complete tracker; it does not get every new idea.

**How to decide the gate**

| Put it on **Plus** if it is… | Put it on **Premium** if it is… |
| --- | --- |
| More organization, sharing, history, or cosmetics | Automation, AI, third-party data, or ongoing vendor cost |
| Something a Household of roommates needs together | Something that saves a power user *time every day* |
| Cheap for us to run | Costs SMS parsing, OCR, Plaid/TrueLayer, or LLM calls |

**Never** sell “you may now record an expense.” **Never** promise investment returns, credit repair, or sending money.

Competitors already sold these as paid: Spendee (bank sync, AI receipt scan, shared wallets), Splitwise Pro (receipts, currency, search, Trip Pass), Money Lover (linked banks, Sheets export, no ads), Goodbudget (history length, devices, OFX), YNAB (goals, debt tools, bank connect), PocketGuard (bill spotting, debt payoff plan).

---

#### Horizon A — next 6–12 months (high conversion, fits current product)

These extend what WalletTrails already is (wallets, bills, SMS import, Household, People, Travel, reports).

| Feature | Suggested plan | Why it sells | Peer analog |
| --- | --- | --- | --- |
| **Wallet intelligence** (Phase 4 of bank-SMS: better matching, duplicates, ATM vs card, reversal links) | Premium | Flagship automation; reason to stay on yearly | Spendee auto-categorize |
| **Import rules** (“if SMS contains DARAZ → Shopping → Meezan wallet”) | Premium | Power users hate retapping the same merchant | Bank-sync rules in Wallet / YNAB |
| **CSV / OFX / QFX / PDF statement import** (user uploads a file, reviews drafts) | Premium | Works in **US/UK/EU** where SMS is rare; keeps Premium useful in T1 | Goodbudget OFX; Money Lover import |
| **Receipt photo + OCR / “Magic scan”** (amount, merchant, date, category) | Premium | Spendee’s newest paid wedge; Splitwise Pro too | Spendee Magic AI Scan |
| **Scheduled / recurring transactions** (rent, salary, Netflix) that post or remind | Plus (simple) / Premium (smart suggest from history) | Habit + forecast accuracy | Splitwise recurring; Goodbudget scheduled |
| **Savings goals** (emergency fund, Hajj, laptop) with monthly target vs leftover | Plus | Emotional, easy to screenshot, not a bank product | YNAB goals; PocketGuard savings |
| **Budget alerts** (50% / 80% / over) as push — already sketched as budget Phase 2 | Plus | Makes Plus feel “alive” every month | Spendee budget alerts |
| **Custom reports + year-in-review** (PDF pack: calendar year, tax-ish summary, household wrap-up) | Premium for PDF packs; Plus keeps CSV | Yearly renewal moment (January, tax season) | YNAB / bank annual summaries |
| **Attachments on transactions** (photo of bill, without OCR) | Plus | Cheaper cousin of AI scan | Splitwise comments + images |
| **Search, filters, saved views** (merchant, notes, amount range, Household) | Plus | Splitwise gated search; users hit this when the ledger is large | Splitwise Pro search |
| **More widgets** (this-month spend, upcoming bills, add-expense) | Plus | Daily surface on the home screen | Money Lover widget |
| **Household seats / “Plus for the group”** (one payer unlocks Plus limits for members) | New SKU or Premium family | Stops four roommates each paying $2 | YNAB share up to 6; Splitwise Duo |
| **iOS app** (parity) | Same entitlements | T1 will not stay Android-only | Every serious peer |

---

#### Horizon B — 12–24 months (bigger product, still on-mission)

| Feature | Suggested plan | Why it sells | Watch-outs |
| --- | --- | --- | --- |
| **Open-banking / aggregator sync** (Plaid, TrueLayer, Salt Edge, etc.) | Premium, **region-gated** | True Spendee/YNAB Premium; T1 ARPU | Vendor $ + regulation; never advertise in countries you don’t support |
| **E-wallet / crypto *read-only* connect** (PayPal, Coinbase-style where APIs exist) | Premium add-on or Premium | Spendee charges for this separately from “cash wallet” | Volatility, scam UX; display only, no trading |
| **Net-worth dashboard** (wallets + receivables − payables − optional asset/liability rows: car, gold, rent deposit) | Plus (manual rows) / Premium (auto from sync) | “What am I worth?” is a classic upgrade | Not investment advice; no live stock tickers as a promise |
| **Debt payoff planner** (snowball/avalanche on existing payables) | Premium | PocketGuard/YNAB paid story | Calculator on *user-entered* loans only |
| **Envelope / sinking funds** (assign leftover to next month’s Hajj or insurance) | Plus or Premium | Goodbudget’s whole product | Don’t fork the data model twice; one “assigned vs available” view |
| **Multi-currency wallets** (a USD account that stays USD, not only Travel Mode) | Premium | Digital nomads, GCC, immigrants | Reporting complexity; keep one *reporting* currency |
| **Shared travel ledger 2.0** (Trip Pass: per-trip currency, settle in home currency, receipt scan) | Premium | Splitwise Trip Pass; our Household events already exist | Don’t confuse with sending money |
| **People: interest / installment plans** on a linked person | Premium | Freelancers and family loans | Easy to look like a lender—keep it a **record**, not a loan product |
| **Accountant / tax pack** (category map, date range, ZIP of CSV+PDF, optional accountant share link, 90-day expiry) | Premium | January/April conversion in T1 | Not a tax-filing service; disclaimer required |
| **Google Sheets / Excel live export** | Premium | Money Lover paid | OAuth scope; no ledger in a public sheet by default |
| **Priority human support + onboarding call** (async first) | Premium | YNAB’s “freakishly nice” support is a paid moat | Cost; cap with yearly only |
| **Wear OS / watch complications / lock-screen** | Plus or Premium | Glanceable “spent today” | Don’t show amounts if privacy lock is on |
| **Desktop / PWA polish, keyboard power-user** | Plus | Web is already a surface; T1 works at a desk | — |

---

#### Horizon C — later or optional (only if positioning stays “tracker,” not “bank”)

Build these only with legal/compliance review. Several peers do them; they also attract the wrong reviewers.

| Feature | If we ever do it | Plan | Do not do |
| --- | --- | --- | --- |
| **Bill negotiation / cancel subscriptions** | Partner; we don’t call merchants | Affiliate or Premium extra | Promise savings |
| **Credit score** | Never as our own product | — | US credit-score widgets are a graveyard of trust |
| **In-app payouts** (Venmo, PayPal, JazzCash to settle Household) | Like Splitwise: **optional rail, country-gated** | Maybe free settle + paid convenience | Becoming a money transmitter |
| **AI chat “should I buy this?”** | On-device or capped LLM, using *their* categories only | Premium, strict quota | Financial advice |
| **Marketplace ads for loans / cards** | Conflicts with AdMob sensitive-finance rules and brand | Avoid | Selling users’ distress |
| **NFT / lifetime gimmicks** | Spendee tried this | Skip | Support nightmare |

---

#### Suggested packing (so the paywall stays understandable)

Keep **two paid SKUs**. Fold new work in; don’t launch Plus, Premium, and five add-ons on day one.

**Plus (future stack)** — “run a household without ads”: unlimited structure, search, goals, budget alerts, attachments, widgets, CSV, event Households, extra devices, maybe **group unlock**.

**Premium (future stack)** — “don’t type”: everything in Plus + import inbox + rules + OCR + Travel + PDF/year packs + (when live) bank/e-wallet sync + Sheets + tax pack + priority support.

**Optional third SKU (only after Premium is selling):** `premium_sync` or “Bank Connect” **monthly** in US/UK/EU — Money Lover’s pattern — so lifetime/Plus users don’t get free aggregator usage forever.

---

#### What Free can still gain over time

Small quality-of-life is allowed on Free so the listing stays competitive: crash fixes, clearer onboarding, extra default categories, privacy improvements, one more language. **Do not** put OCR, bank sync, or unlimited Household on Free after they are paid; that trains everyone to wait.

#### Renewal calendar (use new Premium features as campaigns)

| When | What to ship or highlight |
| --- | --- |
| January | Year-in-review PDF, tax pack (T1) |
| Spring (US/UK tax) | Accountant export |
| Summer | Travel Mode + Trip Household |
| Autumn | Goals, budget copy-forward, “new school year” Household |
| Regional holidays (Ramadan, Diwali, Eid, Black Friday) | Yearly discount, not a new SKU |

---



## 4. Ads: AdSense vs AdMob (how to actually make money)

People say “AdSense” for everything. Google splits the products:

| Product | Where it runs | Use for WalletTrails |
| --- | --- | --- |
| **AdSense** | **Websites** | Marketing site, blog, public help, comparison pages (**international SEO**) |
| **AdMob** | **Mobile apps** | Android free users **worldwide** |
| **Ad Manager** | Both, more ops | Later, if you hire ad ops |

**You cannot put AdSense ad units inside the Play app as your main in-app network.** Play in-app ads = **AdMob** (or another mobile SDK). AdSense is how the **website** earns.

The repo already thinks in AdMob terms: banner / interstitial / rewarded + `premium_hides_ads`.

### 4.1 AdMob (Android) — rules of the game

**Money split (Google demand, commonly cited):** publisher keeps about **68%**, Google about **32%**. Mediation can change this. Treat 68% as a planning number, not a contract.

**Payout**

- Cycle is monthly; payment around the **21st** after the month finalizes.
- Thresholds depend on **reporting currency** (USD payment threshold commonly **$100**). Below that, balance rolls over.
- Identity / tax / bank verification holds are common **in every country**. Complete them **before** launch.

**Formats — what is acceptable in a finance app (all markets)**

| Format | Use? | Where |
| --- | --- | --- |
| Banner / adaptive banner | **Yes, sparingly** | Bottom of **non-money** screens: Help, Themes, empty marketing tips, “Discover” |
| Native | **Yes, if well designed** | Same as banner; looks less spammy |
| App open | **Avoid at launch** | Feels like a bank-app scam **everywhere** |
| Interstitial | **Avoid on money flows**; maybe after **export share** or **end of onboarding** only | Easy to violate Play + destroy trust |
| Rewarded | **Optional** | “Watch to unlock 10 extra imports this month” for Free — **never** reward that reveals balances |

**Hard placement bans (product law, all locales)**

- Dashboard totals, wallet ledgers, transaction confirm, biometric/PIN, SMS/import approval, Household settlement, People accept/reject.

**Sensitive-category policy**

Google **does not allow** using the fact that a user has **high debt / poor credit / detailed financial status** to target personalized ads. Credit, banking, and some financial-planning advertisers are **restricted**. Result: **lower eCPM than a game in every country**. Plan for that.

**Consent**

- **EEA/UK/Switzerland:** GDPR + Google UMP / consent mode. Ads without consent = limited ads or none.
- **US:** state privacy (e.g. CCPA) + Play Data safety accuracy.
- Other regions: still disclose AdMob in the privacy policy; follow local rules as you add countries.

**Play Console**

- Declare **Contains ads**.
- Use **test ad IDs** until production.
- Privacy policy must mention ads, AdMob, and advertising identifiers (**and SMS/import if used**).
- Kids / families: Finance apps should **not** target children.

**eCPM by region (planning, not a guarantee)**

| Region | Banner (indicative) | What it means |
| --- | --- | --- |
| US / UK / AU / CA / DE / Nordics | ~$0.40–$2.00 | Ads can **meaningfully** subsidize Free **if** you have T1 MAU |
| GCC / SG / JP / KR | Often closer to T1 than T3 | Worth listing and optimizing |
| BR / MX / TR / ZA | Mid | Don’t forecast T1 RPM |
| IN / PK / BD / ID / NG / EG | ~$0.08–$0.40 banners | Ads are a **Plus conversion tool**, not the P&amp;L |

**Hybrid ad tactic that works globally**

- Free: 1 adaptive banner on 2–3 screens max + optional rewarded for quota.
- Plus/Premium: zero ads (`premium_hides_ads = true`).
- Remote **kill switch** already exists — use it if ratings drop in **any** major locale (one bad country tanks the global score).

### 4.2 AdSense (website) — real use for this product

**What to monetize**

Not the logged-in web **app** (user ledgers). Monetize **public content** aimed at searchers **worldwide**:

- How to split rent with roommates  
- Cash vs bank wallets  
- Travel spending in a home currency  
- How to import a bank SMS or statement (country-specific posts: UK, UAE, India, Pakistan, US, etc.)  
- Honest comparisons vs Spendee / Splitwise / Goodbudget  
- Help centre (indexable)

**Requirements**

- Real original content (thin landing page = rejection or invalid traffic).
- AdSense approval can take days to weeks.
- Same family of **publisher policies**.
- Typically **$100** payout threshold; PIN / address verification.

**Invalid traffic**

Do not click your own ads. Do not ask friends to click. Do not put ads on screens full of personal finance **PII**.

**How AdSense money shows up**

- Display + (if eligible) search ads on content pages.
- **RPM follows reader geo:** a US/UK article about “best budget apps” can earn many times a T3 pageview. Write for **international search**, not only one local audience.
- This is **brand + SEO + real T1 dollars**, not a studio by itself.

**Logged-in web app ads**

If you ever show ads on the **web app**, use AdSense for web **or** a web equivalent — still **not** on ledgers. Paid users must be ad-free on web if they paid on Play (honour the entitlement **across countries and surfaces**).

### 4.3 Ads + subscriptions together (Google’s own advice)

AdMob is built to mix IAP and ads: **ads for non-payers, hide for premium**. That is Model C. Do not run aggressive ads **and** a harsh paywall at the same time (users feel punished twice)—Splitwise taught this to a **global** audience.

---

## 5. In-app purchases — how they are handled and what Google charges

### 5.1 What Play considers an IAP

Google Play **Billing** is required for **digital** goods consumed in the app: subscriptions, unlocks, extra import quota, ad removal, themes—**in every country where you distribute on Play**.

**Not** Play Billing: physical goods, or real-world services (you are not selling those).

**Do not** add a hidden local checkout (JazzCash, UPI, Paytm, Stripe inside the APK, etc.) to sell Premium and skip Google. That is a policy violation where Play Billing is mandatory. **Web-only** subscriptions for **web-only** features are a grey area; if the same Premium is used in the Play app, expect Google to require Play Billing (or an approved **alternative billing** program **in countries where that program has launched**).

### 5.2 How the purchase should work (product flow)

This matches the existing backend idea: Play purchase → verify → `Entitlement` row → `user_is_premium`. Entitlement is **account-global**: a user who pays in the US, then moves or logs in from another country, stays Premium.

1. User taps Plus or Premium in-app.
2. Play Billing sheet shows **the user’s Play country currency** (USD, EUR, GBP, INR, PKR, BRL, AED, …).
3. Google charges the user’s Play payment method (cards, carrier billing, and **local methods Google has enabled in that country**—UPI, etc. are Google’s problem, not a custom integration).
4. App sends purchase token to **WalletTrails API**.
5. Server verifies with Google Play Developer API; writes `purchase_events` + `entitlement` (`premium_monthly` / `premium_yearly` / `premium_lifetime`).
6. Clients read premium from `/premium` (or bootstrap config) and hide ads / unlock flags.
7. Staff can **grant/revoke** (refunds, influencers, press).
8. Promo codes: either Play **offer codes** (work per country) **or** your existing promo table — pick one source of truth per campaign to avoid double grants.

**Subscriptions**

- Auto-renew until cancelled in Play subscriptions settings.
- Grace period / account hold: keep Premium active during Play grace; then expire. Play’s hold rules can **differ by country**.
- Upgrade Plus → Premium: use Play **base plans / offers** so Google proration applies; don’t stack two entitlements blindly.
- Restore purchases on a new phone: query Play + server (same Google account).

**Trials**

- Implement as Play **free trial offer** on the subscription (Play handles “already used trial” per Google account, worldwide).
- Do not invent a second unpaid trial that Play cannot see.

**Lifetime**

- One-time **non-consumable** `premium_lifetime`.
- Server must never expire it unless refunded / revoked.
- Lifetime users in T1 who would have paid $36/year forever are expensive; **cap supply**.

**Acknowledge purchases** on Android so Google does not auto-refund.

### 5.3 Google’s fees (2026 is a split world — by user country)

Google split **service fee** vs **billing fee** starting **30 June 2026** in the **United States, United Kingdom, and EEA**. Other regions follow a published schedule. **Rest of world is listed for 30 September 2027.** The fee that applies is based on **the transacting user’s country**, not only where the developer lives.

Until a region is rolled out, **classic Play fees still apply** there.

#### A. Classic rates (still typical outside US/UK/EEA in 2026, including most of Asia, Africa, LATAM)

| Transaction type | Typical Google service fee |
| --- | --- |
| Subscriptions | **15%** |
| One-time IAP / paid app — Small Business Program (first **$1M** USD per year) | **15%** |
| One-time IAP after $1M (standard) | **30%** |

**Example (USD list):** User pays **$35.99/year** Premium.

- Google ~**15%** → **~$5.40**
- You receive **~$30.59** before your income tax and payout FX.

#### B. New structure (US/UK/EEA from 30 Jun 2026; AU/JP later in 2026; RoW 30 Sep 2027)

Google charges a **service fee** even if you use another checkout, plus a **billing fee** only when you use **Play Billing**.

| | Auto-renewing subscriptions | Notes |
| --- | --- | --- |
| Service fee | **10%** (all volumes for subscriptions) | |
| Play Billing fee (US/UK/EEA) | **+5%** | **Total 15%** if you stay on Play Billing |
| Alternative billing / web link (where allowed) | **0% billing fee** | You still pay **10% service fee** + Stripe/Adyen/etc. |

For **non-recurring** IAPs, service fees can be **10–25%** depending on new vs existing installs and programs; Play Billing adds **5%** in US/UK/EEA. **Billing fee % for other countries is “announced later”** as of the mid-2026 docs.

**Practical takeaway for WalletTrails in 2026–2027**

- Budget **~15% to Google** on subscriptions in **most countries**, including T1 if you stay on Play Billing (10%+5%).
- Do not design the business assuming 0% fees via local wallets inside the APK.
- When alternative billing is available in a given country, you *may* offer web checkout and pay **~10% to Google + ~2–4% to a processor**—only after legal/policy review. **US/UK/EEA first; worldwide later.**

### 5.4 Other money Google / stores take

| Fee | Amount | When |
| --- | --- | --- |
| Play developer registration | **US$25 once** | Account creation |
| Apple Developer (iOS later) | **US$99 / year** | International iOS listing |
| VAT / GST / sales tax | Shown on Play invoice; Google often **collects & remits** in many countries | Configure **tax / merchant** settings per country in Play Console |
| FX | Google typically pays the developer in the account’s currency | Bank spread if you convert |
| Refunds | Google can refund; you must revoke entitlement | Chargebacks in all markets |

### 5.5 Worked examples (USD list, 15% Play fee)

Ignore VAT on top (the user may pay more than list). Your 15% is on the **amount Google attributes as the digital price** (confirm in Console).

| SKU (USD list) | User pays (ex-tax) | Google ~15% | You |
| --- | --- | --- | --- |
| Plus monthly $1.99 | 1.99 | 0.30 | **1.69** |
| Plus yearly $14.99 | 14.99 | 2.25 | **12.74** |
| Premium monthly $4.99 | 4.99 | 0.75 | **4.24** |
| Premium yearly $35.99 | 35.99 | 5.40 | **30.59** |
| Lifetime $59.99 | 59.99 | 9.00 | **50.99** (one-time) |

**100 T1 Premium yearly subscribers:** 100 × $30.59 ≈ **$3,059/year** to you.

**100 T3 Premium yearly at a localized $12.99:** 100 × $11.04 ≈ **$1,104/year**. Volume still matters; **ARPU will not match T1**.

**Ads:** 20,000 free MAU that are **mostly T3** might add tens to low hundreds of USD/month. The same 20,000 if **mostly T1** could be several thousand USD/month even on sparse banners. Plan the company on **subscriptions**; treat ads as Free-tier pressure + T1 upside.

### 5.6 Accounting on our side

- Entitlement is **per user**, not per device or per country.
- Household: **payer’s Premium does not unlock all members** at v1 (Splitwise often sells individual Pro). Optional later: “Household Plus” shared entitlement (valuable for **international families**).
- Web and Android must respect the same entitlement (already the right architecture).
- If you add **Stripe on web** for T1, map it to the **same** entitlement table and stay inside Play policy for users who installed from Play.

---

## 6. Play Store launch strategy (international)

This complements `GOOGLE_PLAY_LAUNCH_CHECKLIST.md`. That file is the **release form**. This section is the **go-to-market sequence for a worldwide listing**.

### 6.1 What “good launches” in Finance actually did

| Playbook | Who | What they did |
| --- | --- | --- |
| Design + feature | Spendee | Ship a beautiful **free** tracker globally → store featuring → add paid **international** bank sync years later |
| Method + trial | YNAB | Teach a system, long trial, no free forever, **global SaaS** |
| Network | Splitwise | Free sharing until default, then ads/caps/Pro, **100+ currencies** |
| ASO grind | Money Manager | Utility screenshots, “expense tracker” keywords **per language**, tiny paid sync |
| Limits without ads | Goodbudget | Useful free envelope cap, paid unlimited, bank sync **where they have it** |

**WalletTrails launch playbook:** Spendee/Goodbudget **useful free**, Splitwise-like **Household growth**, Money Lover-like **cheap Plus**, import automation as **Premium**. Not YNAB. **English store listing first**, then locales.

### 6.2 Pre-launch (weeks −8 to −2)

1. **Developer account:** $25, identity, **device verification** for personal accounts. Organization account if you want a brand name and D-U-N-S (better for **international trust**).
2. **Closed test (BLOCKER for new personal accounts):** **≥12 testers opted in continuously for 14 days**, then apply for production. Recruit **20+ testers in more than one country** if you can (US/EU + home market) so dropouts don’t reset the clock and you catch locale bugs.
3. **Privacy policy + terms** live on HTTPS, written for **international** users: SMS/import, ads, IAP, account deletion, GDPR contact, data location.
4. **Data safety form:** finance data, optional SMS, ads SDK. Must match **every** region you ship to.
5. **SMS permission justification** — Play is strict **globally**. Copy must match `BANK_SMS_PRIVACY.md`: optional, user-reviewed drafts, not silent posting. App must be **fully usable if the user denies SMS** (US/EU reviewers will deny SMS).
6. **Production AAB** (API 36+ for submissions after 31 Aug 2026), Play App Signing, production API healthy from **multiple geos** (not only one country’s network).
7. **IAP:** create SKUs; set **USD default + regional prices**; license testers in **several countries**. **Do not** enable heavy ads or a hard paywall on the first public build.
8. **Store listing (ASO)**  
   - **Default language: English (US or UK).**  
   - Title: `WalletTrails: Budget & Expenses` (keyword in title, brand first).  
   - Short: `Wallets, bills, household splits, travel, optional bank SMS import`.  
   - Screenshots: dashboard, add expense, household, privacy hide, import approve — **no fake “connect all banks” claims**.  
   - Use **generic currency formatting** in screenshots (or mixed USD + others), not only one local currency, so the listing feels global.  
   - Add **localized listings** next: Spanish, Portuguese, Arabic, Hindi, Urdu, French, German, Indonesian—as you have real UI strings.
9. **Countries:** default **Available in all countries** except those you cannot serve (sanctions, cannot handle tax, or cannot offer support). Staged rollout of the **APK %**, not a one-country store.
10. **Reviewer notes:** test login, how to skip IAP, how to deny SMS and still use the app, English support contact.
11. **Support email** monitored daily for 2 weeks post-launch (rating recovery is **global**).

### 6.3 Launch configuration (week 0)

**Recommended first production config**

| Lever | Launch | After 4–8 weeks |
| --- | --- | --- |
| Price | **Free to install**, Plus/Premium SKUs live | Same |
| Ads | **Off** or 1 banner on Help only | Turn on Free banners if **global** rating ≥4.4 |
| Paywall | Soft: Plus/Premium visible, **no nag** | Add limit sheets when users hit 3rd wallet |
| Import / SMS | Available; Premium gate **or** generous Free taste; **deny-SMS path required** | Tighten Free import cap |
| Countries | **Worldwide** (supported) | Same; add localized listings |
| Rollout | **20% → 50% → 100%** staged | Full |

Shipping ads + hard paywall + SMS permission **on day one** is how Finance apps get 2.8 stars **in every language**.

### 6.4 Growth loop (weeks 1–12)

1. **Closed testers** leave the first reviews (honest). Aim for English reviews first; they lift conversion in T1.
2. **Household invite** is the viral loop (Splitwise)—including **cross-border** households. Make invite rock-solid.
3. Content: English shorts first (travel, roommates, hide amounts), then local languages. Country-specific import/SMS explainers as SEO.
4. Measure (PostHog, no amounts): activation, week-4 retention, household created, paywall view, purchase—**broken down by country**.
5. Do **not** buy generic CPI traffic until crash-free and rating ≥4.2. If you buy, buy **T1** first (higher LTV).

### 6.5 When to turn on each monetization layer

| Week | Monetization |
| --- | --- |
| 0–2 | Free app worldwide, entitlements live for license testers only |
| 2–4 | Public Plus/Premium with trial + **regional prices**; **no** interstitial ads |
| 4–8 | Free limits enforced in UI; AdMob banners on safe screens |
| 8–16 | Yearly highlighted (calendar: New Year, tax season US/UK, Ramadan, Diwali, Black Friday—**pick by audience mix**) |
| 16+ | Lifetime flash sale; AdSense on **international** SEO; iOS decision; first **bank-aggregator** country if funded |

### 6.6 Positioning vs Play category peers

**Do claim:** Multi-currency wallets, bills/loans, household privacy (personal wallets hidden from the group), optional import *suggestions*, offline personal entries, travel tracking, web + Android.

**Do not claim:** “Automatic bank sync with every bank,” “we send money,” “we increase your credit score,” or that SMS import is available/legal on every device and country.

### 6.7 Localization and compliance (international, not optional forever)

| Layer | Launch | Next |
| --- | --- | --- |
| UI language | English | es, pt, ar, hi, ur, fr, de, id |
| Currency | User-selected; sensible default from locale | More format/locale polish |
| Privacy | GDPR-capable policy, deletion, export | DPA / EU representative if EU users grow |
| Support | English email / in-app | Time-zone coverage; later local language |
| iOS | Not required to prove Android | Required for T1 parity with Spendee/YNAB |

---

## 7. Recommended 18-month path (if you follow Model C)

| Phase | Time | Business |
| --- | --- | --- |
| **0** | Now | This research + global SKU names + **USD list + regional prices** in Console (unpublished) |
| **1** | Play closed test | 12×14 testers (multi-country if possible); IAP license testers; ads off |
| **2** | Public launch | **Worldwide** free core; soft Plus/Premium; import taste; English listing |
| **3** | Habit | Enforce wallet/budget limits; banners on Free; first extra locales |
| **4** | Automation story | Premium = full import inbox + web queue; document **per-OS** behavior |
| **5** | Scale | Yearly campaigns by region; AdSense in English; Household-plus experiments |
| **6** | Expand | iOS; Horizon B items (aggregator in 1–2 T1 countries, goals, OCR); alternative billing where Play allows |

---

## 8. Risks unique to this category

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Play SMS permission rejection | Finance + SMS looks like stalkerware **in every review queue** | Optional, prominent disclosure, human approve, app works without SMS |
| Ad policy / brand | Ads next to balances look like a scam worldwide | Placement bans + premium_hides_ads |
| T3-only eCPM | Ads won’t pay hosting | Subscriptions + T1 distribution |
| One global rating | A T3 ad backlash tanks T1 conversion | Sparse ads, kill switch, don’t interstitial |
| Lifetime SKU | Import/server/aggregator costs rise | Cap lifetime; keep inbox/sync on Premium **sub** |
| Trust / data residency | EU/UK users will ask | Honest policy; staff cannot browse ledgers |
| Uniform high USD price | T3 installs, T3 zero conversion | Play **regional pricing** |
| Uniform too-low price | T1 underpays forever | USD list at Spendee parity in T1 |
| Feature gating too hard | 1-star “can’t add expense” in 40 countries | Unlimited transactions on Free |
| Fake bank-sync marketing | Policy + reviews + lawsuits | Region-gate aggregators; never claim globally |
| GDPR/CCPA mistakes | Fines and delisting | Legal export, deletion, consent for ads in EEA |

---

## 9. Decision summary

| Question | Answer |
| --- | --- |
| Which of the 3 models? | **Hybrid (Model C)** |
| Which 3 user plans? | **Free / Plus / Premium** as in §3 — **same worldwide** |
| How to price? | **USD list** (Spendee-like) + **Play regional prices** for T2/T3 |
| Where to launch? | **Worldwide** on Play (supported countries), English listing first |
| AdSense? | **Website content only**, international SEO |
| In-app ads? | **AdMob**, Free users, never on money surfaces; eCPM from **T1** |
| IAP? | Play Billing subscriptions + optional lifetime promo; **one entitlement globally** |
| Google’s cut (2026)? | Plan **~15%** on subs (classic, or 10%+5% in US/UK/EEA) |
| How peers launched? | Free manual tracker **globally** → paid automation; YNAB is the outlier |
| Our Premium analog to bank sync? | **Import inbox + intelligence now**; **open banking later, per country** — not fake global sync |
| Future paid features? | **§3.6** — Plus = organization/sharing; Premium = automation/AI/sync; optional later Bank Connect SKU |

---

## 10. Sources (public, dated in research)

Use these to re-verify prices and fees before locking SKUs (stores change **by country**).

- Spendee pricing and help: [spendee.com/pricing](https://www.spendee.com/pricing), Plus/Premium help articles (updated 2021–2025); Magic AI Scan (help, Aug 2026). Note: “prices might differ based on the country.”
- Spendee subscription explainer (Medium, Spendee).
- Google Play fees: [Understanding Google Play’s lower service fees](https://support.google.com/googleplay/android-developer/answer/16954621); Android Developers blog *Expanded billing choice and lower fees* (Jun 2026). Rollout: US/UK/EEA 30 Jun 2026 → AU/JP → RoW 30 Sep 2027.
- Closed test: [App testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465); registration fee [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) (US$25).
- AdSense vs AdMob: [Google Ad Manager, AdSense, and AdMob](https://support.google.com/adsense/answer/9234653).
- AdMob policies: [Google Publisher Policies](https://support.google.com/admob/answer/10502938); [payment thresholds](https://support.google.com/admob/answer/2772208); [payments cycle](https://support.google.com/admob/answer/2772140).
- YNAB pricing / timeline: ynab.com/pricing; ynab.com about timeline (spreadsheet 2004 → SaaS 2015).
- Splitwise Pro, Goodbudget Premium, PocketGuard Plus, Money Lover, Wallet by BudgetBakers: public store/pricing pages and 2026 roundups (**regional prices vary**).

**Internal:** `WALLETTRAILS_PRODUCT_GUIDE.md` §19–23; `GOOGLE_PLAY_LAUNCH_CHECKLIST.md`; `BANK_SMS_PRIVACY.md`.

---

## 11. Open choices for the owners

These are business decisions, not engineering:

1. Final **USD list** ($4.99 vs $5.99 Premium monthly) and how aggressive **T3 regional** discounts are.
2. Launch with ads **off** vs one Help-screen banner.
3. Whether Travel Mode sits in Plus or Premium (this doc: **Premium**).
4. Whether Household members get Plus if **one** member pays (this doc: **no** at v1).
5. Whether lifetime exists at all.
6. First extra **store languages** after English.
7. Whether **iOS** is year-1 or year-2 (T1 users will ask).
8. First **Horizon A** Premium bets after launch (recommend: import rules + file/OCR import so T1 Premium is not SMS-only).
9. Whether **Household group unlock** is a Plus feature or a separate family SKU.

When those are decided, the next *implementation* spec is: Play Console product IDs, **regional price spreadsheet**, paywall copy (English), and which feature flags map to Plus vs Premium.
