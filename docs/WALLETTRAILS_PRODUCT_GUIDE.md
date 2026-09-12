# WalletTrails — Complete Product Guide

**Tagline:** Follow every rupee.  
**Primary market:** Pakistan, with PKR as the default currency.  
**Reviewed:** 12 September 2026.  
**Audit scope:** The current React web app, React Native Android app, Django API, staff admin app, and product documentation.

---

## 1. Product overview

WalletTrails is a personal-finance and shared-expense app. It gives a person or household one place to understand money held in cash and bank wallets, income that is expected or received, daily spending, recurring costs, loans, money owed to them, budgets, and future cash flow.

It is designed for everyday life in Pakistan: salaried people, freelancers, people managing loans or bills, families, roommates, and friends sharing the costs of a home, event, or trip.

WalletTrails is built around these principles:

- Personal finances remain private.
- Shared Household activity is separate from personal wallets.
- Amounts can be masked while using a phone in public.
- Core personal entries can be recorded offline and synchronized later.
- The app explains current money and expected future money, not only past transactions.

WalletTrails is not a bank, lender, payment processor, investment adviser, or automatic live bank-sync service. It records information a user enters or explicitly reviews and imports. It does not transfer money between banks or people.

---

## 2. Product surfaces and technology

| Surface | Purpose | Status |
| --- | --- | --- |
| React web app | Full personal finance experience in a browser | Implemented |
| Android app | Mobile-first React Native / Expo experience | Implemented in repository |
| Django REST API | Source of truth for product data and permissions | Implemented |
| Offline local store | Personal records and supported queued transactions without connection | Implemented |
| Staff operations web app | Support, campaigns, premium, configuration, and audit tools | Implemented for staff |
| Marketing site | Separate public React/Vite product website | Implemented in wallettrails-site |

Core stack:

- Web: React, TypeScript, Vite.
- Mobile: React Native and Expo.
- Backend: Django and Django REST Framework.
- Authentication: JWT login and refresh tokens.
- Database: SQLite for development; PostgreSQL is the production target.
- Push: Expo device-token and push-delivery infrastructure.

---

## 3. Account, sign-in, and onboarding

### Account access

Users can:

- Register with name, email, and password.
- Sign in and restore a session.
- Request a password reset, verify a reset OTP, and set a new password.
- Sign out. On mobile, sign-out clears that user’s local offline database.

### Onboarding profile

The first-time experience can capture:

- Date of birth.
- Gender or prefer-not-to-say preference.
- User type: student, professional, self-employed, or retired.
- Country.
- Preferred currency, with PKR as the default.

Users then create wallets and begin adding money activity.

---

## 4. Dashboard and overview

The Dashboard is the daily financial snapshot. It provides:

- Combined total across personal wallets.
- Individual bank and cash wallet balances.
- This month’s income and expenses.
- Recent transactions.
- Expected-month / forecast information.
- Household entry points where applicable.
- Quick access to add income, expense, transfer, or People activity.

It helps answer:

1. How much money do I have across cash and bank accounts?
2. What came in and went out this month?
3. What income, costs, and commitments are still ahead?

---

## 5. Wallets and accounts

Wallets represent where money lives.

### Wallet types

- **Bank:** a bank account, digital wallet, or similar account.
- **Cash:** physical cash.
- **Person:** a special counterparty record used by the People lending/borrowing workflow.

### Wallet features

- Create a wallet with name, type, and opening balance.
- View bank and cash wallets separately and as a combined total.
- Edit a wallet.
- Review its transaction ledger.
- Add income and expenses.
- Transfer money between personal wallets.
- Mask values with the privacy feature.

Wallet balance is calculated as:

    Opening balance + income transactions − expense transactions

A transfer creates an outgoing record for the source wallet and an incoming record for the destination wallet. It changes wallet balances but does not change the combined personal total.

---

## 6. Daily money entry and transaction history

The global add-money flow supports:

| Action | Purpose | Wallet effect |
| --- | --- | --- |
| Income | Record money received | Adds to selected wallet |
| Expense | Record money spent | Reduces selected wallet |
| Transfer | Move money between personal wallets | Reduces source and increases destination |

Each transaction can store amount, date, wallet, category, notes, and links to an income source, payable, receivable, or Household ledger when relevant.

### Offline transaction support

For supported personal flows, mobile users can:

- View cached personal records without a connection.
- Add personal income, expense, and transfer entries offline.
- Queue changes with a client-generated mutation ID so retrying does not duplicate a transaction.
- Synchronize queued entries after reconnecting.
- See offline and pending-entry status.

Household shared writes require an internet connection because they affect other members and require current server-side permission and consistency checks.

---

## 7. Income tracking

The UI calls these records **Income**; the underlying historical model is named Project.

### Supported income types

- Recurring monthly income, such as salary.
- Contract monthly income, such as a regular client retainer.
- One-time income.
- One-time income paid in installments.

### Income capabilities

- Add name, amount, start date, notes, and optional default wallet.
- Record payment received, which creates a linked income transaction.
- Pause, resume, complete, or mark an income source stuck.
- Record an advance amount.
- See remaining amount for one-time and installment work.
- Track active and completed sources.

For installment income, WalletTrails tracks expected installment amount, total installments, received installments, and remaining amount.

---

## 8. Bills, loans, and money owed to the user

The Bills area groups ongoing obligations and expected incoming money.

### Monthly costs

For rent, utilities, internet, subscriptions, maintenance, and similar costs:

- Add monthly or one-time costs.
- Set due day for monthly items.
- Link an optional wallet.
- Activate or deactivate the item.
- Record payments.
- Include active monthly costs in forecast calculations.

### Payables: money the user owes

For loans and installment plans:

- Save total amount, monthly amount, installment count, and due day.
- Link a payment wallet.
- Record installment payments.
- See paid installments and remaining amount.
- Mark a plan completed or stuck.
- Receive due-date reminders when enabled.

### Receivables: money owed to the user

For client payments or another person’s installment plan:

- Save total amount, monthly amount, installment count, and start date.
- Link a receivable to an income source where applicable.
- Record received payments.
- See received installments and remaining amount.
- Mark a receivable completed or stuck.

---

## 9. Reports and forecasts

Reports explain what has happened and what the user expects next.

### Report content

- Month picker.
- Expected income.
- Expected outgoing money.
- Expected net result.
- Actual monthly income and spending.
- Forecast-versus-actual comparison.
- Spending by category.
- Wallet ledger and wallet filter.
- Income and outgoing lists.

### Export

- The mobile app can share CSV reports through the device share sheet.
- The web app has report export utilities for PDF and CSV workflows.
- Household report CSV export is supported.

Reports never move money; they summarize WalletTrails data.

---

## 10. Monthly category budgets

WalletTrails supports personal spending limits by month and category.

Users can:

- Create a category budget for a chosen month and year.
- Create an overall monthly expense cap.
- See live spending calculated from transaction rows.
- See budget progress and status.
- Copy budgets from a previous month.
- Edit or delete a budget.

Budgets are planning and visibility tools. They do not prevent the user from adding a transaction.

---

## 11. Privacy lock and amount masking

Privacy is a core product feature.

Users can:

- Hide money values across core screens.
- Reveal values using device biometrics, device credential, or a WalletTrails PIN flow where configured.
- Re-hide values immediately or after a selected timeout when the app backgrounds.
- Continue using the app while values are masked.
- Keep exact PKR values out of notification wording when privacy is active.
- Use Android screenshot-protection capability where supported.

WalletTrails does not receive or store fingerprint or face templates. The device operating system performs biometric verification.

---

## 12. Reminders and push notifications

WalletTrails uses two reminder layers:

| Layer | Purpose |
| --- | --- |
| Local device notifications | Scheduled from Bills data on the device |
| Server push notifications | Can reach a registered device even when the app has not recently been opened |

Users can choose:

- Whether notifications are enabled.
- Whether payable and receivable reminders are enabled.
- Lead times: 3 days before, 1 day before, and on the due date.
- Whether product-update and marketing pushes are allowed.

Reminder taps can deep-link a user to the related bills area.

---

## 13. Household shared expenses

Household is a separate shared-finance space for family, roommates, trips, and events.

### Household privacy model

Personal wallets remain private. Household members do not automatically see another member’s bank balance, private income, loans, or unrelated transactions.

Members see only records deliberately added to the shared Household ledger.

### Membership

Users can:

- Create a Household such as Khan Family or Flat 4B.
- Invite people through a unique invite code or shareable invite link.
- Invite by email where available.
- Preview a Household before accepting.
- Accept or decline an invitation.
- Regenerate or revoke invitations.
- Manage members and roles according to permission rules.

### Household ledgers

- **Ongoing ledger:** continuing shared costs, such as home expenses.
- **Event ledger:** a finite ledger for a trip, wedding, Eid shopping, or similar event.

An event ledger can be closed to produce a final total and block new entries until an authorized member reopens it.

### Shared expense dual link

A shared expense can be linked to:

1. A personal wallet, decreasing the payer’s personal balance.
2. A Household ledger, making the shared expense visible to group members.

Example:

    You pay Rs. 5,000 for groceries using your Meezan wallet.
    Your Meezan wallet decreases by Rs. 5,000.
    The Household ledger shows Groceries — Rs. 5,000 — paid by you.

This is not a transfer between members’ bank accounts.

### Contributions and equal split

For a trip or event, members can contribute to a shared pot. WalletTrails calculates:

- Expenses paid by each member.
- Contributions by each member.
- Each member’s credit.
- Equal fair share.
- Suggested who-pays-whom settlements.

The settlement is a suggestion. WalletTrails does not initiate bank payments.

### Household reports and alerts

Household reports can show total, category breakdown, who paid how much, timeline, closed-event summary, and CSV export. Members can also receive in-app notifications when another member posts an expense or contribution.

---

## 14. People: direct lending and borrowing between two users

People is different from Household. It supports a direct, linked relationship between two WalletTrails users for lending, borrowing, paying, and receiving.

Capabilities include:

- Create or use a person account.
- Share a People link code or invite another user.
- Accept or decline a link invitation.
- Propose a lend, borrow, pay, or receive action.
- Choose the proposer wallet and, when needed, the counterparty wallet.
- Require counterparty acceptance before paired records are finalized.
- Review a People history.
- Receive People notifications.
- Unlink a People relationship.

This gives both people a confirmation-based record instead of silently changing someone else’s books.

---

## 15. Travel Mode and foreign-currency context

Travel Mode lets a user record travel spending while retaining PKR as the core ledger currency.

Users can:

- Start a travel session.
- Choose a travel currency.
- Use live, cached, manual, or offline exchange-rate context where available.
- Store original foreign amount, rate, rate source, and the PKR bookkeeping amount.
- Set travel start and end dates.

Travel Mode is a tracking feature, not a currency-exchange, trading, or remittance service.

---

## 16. Bank SMS assisted import

Bank SMS import is an assisted record-entry flow. It is not a promise of direct bank integration or automatic bank sync.

The feature can:

- Accept pasted or shared transaction SMS content.
- Model Android SMS, notification, and share sources for supported flows.
- Suggest expense, ATM withdrawal, income, reversal, or unknown classification.
- Suggest amount, date, category, wallet, counterparty, bank hint, and account mask.
- Ask the user to review and approve or reject the proposal.
- Avoid duplicate pending imports using a fingerprint.
- Support wallet aliases, default cash wallet, custom classification overrides, and ATM settings.
- Link a reversal to a prior approved import when identifiable.

An SMS remains a suggestion until the user approves it.

---

## 17. Themes and mobile experience

Theme options include Emerald, Ocean, Violet, Rose, and Amber. WalletTrails stores the preferred theme and provides animated visual transitions on mobile.

Mobile experience features include:

- Floating liquid-glass tab navigation.
- Global add-money control.
- Pull to refresh.
- Spring and list entrance animations.
- Android balance widget in native EAS/preview or production APK builds.

The native CashTrail Balance widget shows combined wallet balance on the Android home screen and opens the app when tapped. It does not appear in Expo Go.

---

## 18. Help and support

Users can access Help & Support within the app.

They can:

- Create a support thread.
- Select a category such as account, billing, bug, or other.
- Send messages and follow replies.
- View support-thread status.
- Receive a push notification when staff reply, if notifications are enabled.

Financial records and screenshots are not automatically attached to support threads; the user controls what they submit.

---

## 19. Premium, promo, ads, and remote configuration

The backend includes monetization and configuration infrastructure. A particular offer should only be claimed publicly when configured and released.

### Premium and promo infrastructure

- User premium-status endpoint.
- Google Play Billing verification workflow.
- Staff premium grant and revoke actions.
- Promo code creation, redemption, and tracking.
- Purchase-event records.

### Remote configuration

The backend can manage:

- Ad enablement and emergency kill switch.
- Banner, interstitial, and rewarded-ad settings.
- Premium ad bypass.
- Feature flags.
- Minimum app version and force-update rules.
- Maintenance notices.
- Support configuration.

### Advertising trust rules

If advertising is enabled, it must not be placed over balances, biometric/PIN entry, money-entry confirmation, or other sensitive finance interactions. Privacy lock is intended to remain a core trust feature.

---

## 20. Analytics

WalletTrails supports privacy-conscious product analytics when configured.

Analytics can help measure activation, offline sync, Household adoption, reports, and feature usage. The intended boundary is:

- Capture non-sensitive usage events, such as wallet created, transaction created, Household joined, or report exported.
- Do not send raw money amounts, account numbers, wallet balances, full notes, or invite codes as normal analytics event properties.
- Mask finance inputs and money-value UI in session diagnostics.
- Reset analytics identity after logout.

Analytics is not the source of truth for a user’s financial records.

---

## 21. Privacy-safe staff operations

WalletTrails has a staff-only operations surface for running the service. It is designed not to be a backdoor into customer money.

### Staff can manage

- Safe hosted-user summaries and non-sensitive aggregates.
- Inactivity flags and re-engagement campaigns.
- Push campaign creation, estimation, scheduling, sending, and cancellation.
- Support threads and replies.
- Premium grants, revocations, promo codes, and purchase queues.
- Remote configuration, feature flags, maintenance, and ad controls.
- Audit logs.
- Safe hosted-user export.

### Staff must not routinely access

- Transaction rows.
- Wallet balances.
- Bill or loan details.
- Household ledger line items or settlements.
- Private notes.
- Full transaction exports.

Staff operations use staff authorization and audit logs.

---

## 22. Security and data isolation

Implementation protections include:

- JWT-protected API access.
- Password-reset OTP flow.
- Per-user transaction idempotency for offline retries.
- Device-token registration and revocation.
- Staff-only operations endpoints.
- Staff audit records.
- Personal records scoped to the authenticated user.
- Household access checked through active membership.
- Household invite preview before acceptance.
- Bank-SMS duplicate protection.
- Local mobile cache cleared at logout.

No app can guarantee absolute security. Users should keep their device secure and use a strong, unique password.

---

## 23. Important limitations and honest claims

1. **No automatic bank feed is promised.** WalletTrails does not claim live automatic transaction feeds from Meezan, NayaPay, JazzCash, HBL, or other banks.
2. **WalletTrails does not move money.** It records and explains money; Household split results are suggestions only.
3. **Household does not expose personal wallets.** Members see the shared ledger only.
4. **Household shared edits require internet.** This protects permissions and ledger consistency.
5. **Offline support focuses on personal transaction flows.** Users should synchronize and review pending entries after reconnecting.
6. **Premium, ads, and Play Billing are configuration-dependent.** Infrastructure exists; public availability depends on release configuration.
7. **Travel exchange information is contextual.** It is not an FX, trading, or remittance service.
8. **Reports depend on recorded data.** They are accurate only when entries and approved imports are accurate.

---

## 24. Typical user journeys

### Personal monthly money

1. Create cash and bank wallets.
2. Add salary or other income.
3. Add monthly costs, loans, and due dates.
4. Log daily money in, money out, and transfers.
5. Set budgets.
6. Review forecast and reports.

### Freelancer or small-business owner

1. Add monthly clients, one-time jobs, or installment work.
2. Record advances and received payments.
3. Track remaining client money as receivables.
4. Add business costs and loan installments.
5. Review forecast and export reports.

### Household, roommates, or trip group

1. Create a Household and a shared ledger.
2. Share the invite code or link.
3. Add shared expenses, optionally linked to the payer’s personal wallet.
4. Review category and member reports.
5. For an event, add contributions, close the ledger, and view equal-split suggestions.

### Privacy-conscious user

1. Enable Hide Amounts.
2. Use the app with values masked in public.
3. Reveal values with biometric, device credential, or PIN.
4. Configure re-hide timing and privacy-safe notifications.

---

## 25. One-sentence product description

**WalletTrails is a Pakistan-first money app that helps people track wallets, income, bills, budgets, shared expenses, and future cash flow—with offline personal entries, privacy-masked amounts, reminders, and reports in one calm place.**
