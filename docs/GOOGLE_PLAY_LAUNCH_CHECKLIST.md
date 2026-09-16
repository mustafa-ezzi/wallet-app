# WalletTrails — Google Play Launch Checklist

> **Use this as the release form for the first public Android launch.** Mark a box only after the evidence is available. Items marked **BLOCKER** must be complete before requesting production access or starting a production rollout.
>
> Last reviewed: **12 September 2026** · Package name: `com.wallettrails.app` · Platform: Android / Expo

---

## 1. Release record

Fill this section before starting a release. It provides a single record of exactly what was submitted.

| Field | Value |
|---|---|
| Release name | `____________________________` |
| App version shown to users | `____________________________` |
| Android version code | `____________________________` |
| EAS production build URL | `____________________________` |
| AAB file / build ID | `____________________________` |
| Release track | `Internal / Closed / Production` |
| Countries selected | `____________________________` |
| Release owner | `____________________________` |
| Release date | `____________________________` |

- [x] The configured package name is `com.wallettrails.app` (`mobile/app.json`). Confirm the uploaded AAB before release.
- [ ] This is the intended first-upload package name; it will not be changed later.
- [ ] The uploaded artifact is an **Android App Bundle (`.aab`)**, not an APK.
- [ ] The release version code is greater than every version code already uploaded to Play.
- [ ] The release notes accurately describe only features and fixes in this build.

---

## 2. Developer account and Play Console access

### Account setup

- [ ] **BLOCKER** Google Play developer account registration fee is paid and the account is active.
- [ ] **BLOCKER** The developer account’s identity verification is complete.
- [ ] Developer name shown on Play is confirmed: `____________________________`.
- [ ] Public developer contact email is monitored: `____________________________`.
- [ ] Support website or support contact is available and tested.
- [ ] The correct account type was selected (Personal or Organization).
- [ ] If this is an Organization account, required organization verification and D-U-N-S information are complete.
- [ ] If this is a new Personal account, the Play Console mobile-app device verification is complete on a real, non-rooted Android 10+ device.
- [ ] The account owner can sign in to Play Console, Expo/EAS, Firebase, backend hosting, and the support inbox.

### New Personal account testing requirement

This applies to Personal developer accounts created after 13 November 2023.

- [ ] **BLOCKER, if applicable** A Closed test has at least **12 opted-in testers**.
- [ ] **BLOCKER, if applicable** Each required tester has remained opted in continuously for at least **14 days**.
- [ ] Testers installed the app, exercised core flows, and sent feedback.
- [ ] The Production access application is submitted in Play Console after the closed-test condition is met.
- [ ] The Production access questionnaire explains the test population, feedback received, fixes made, and launch readiness honestly.

**Tester record**

| Tester email | Opted in on | Still opted in? | Key feedback / result |
|---|---:|---|---|
| `________________` | `________` | `Yes / No` | `________________` |
| `________________` | `________` | `Yes / No` | `________________` |
| `________________` | `________` | `Yes / No` | `________________` |

---

## 3. App build and technical readiness

### Android and signing

- [x] **BLOCKER** `mobile/app.json` identifies the app as `com.wallettrails.app`.
- [ ] **BLOCKER** The AAB targets Android 16 / **API level 36 or newer** for a submission made after 31 August 2026.
- [x] The EAS `production` profile is configured to create an Android App Bundle with automatic version-code increments. A successful production build is still required.
- [ ] Play App Signing is enabled or accepted for the app.
- [ ] The EAS upload keystore / upload credentials are retained safely and access is restricted.
- [x] Production EAS configuration points to the HTTPS Railway API, not localhost. Live-device availability must still be tested.
- [ ] The backend API is HTTPS, healthy, and reachable from an ordinary Android phone on mobile data.
- [x] Firebase configuration files name `com.wallettrails.app`; push notifications still require a live-device test.
- [x] App icon, splash screen, and in-app branding use the current WT wallet logo.
- [ ] A fresh install and an in-place update were tested on a physical Android device.
- [ ] The app starts without a crash when offline, with slow data, and after being backgrounded.

### Required functional smoke test

Run this on the exact Internal/Closed build that will be promoted.

- [ ] Create an account, log out, log back in, and reset a password successfully.
- [ ] Onboarding can be completed without dead ends.
- [ ] Add, edit, and delete a wallet.
- [ ] Add income, an expense, and a transfer; balances and totals remain correct.
- [ ] Create or edit a bill / due date and receive its reminder if reminders are included.
- [ ] Privacy lock / amount masking works and does not reveal amounts in notifications when privacy mode is enabled.
- [ ] Reports load and any CSV/PDF export used in the store listing works.
- [ ] Household creation, invite, contribution, and settlement flows work if included in the release.
- [ ] Travel Mode / currency conversion works if it is described in store copy or screenshots.
- [ ] Offline personal transaction creation syncs safely when connectivity returns.
- [ ] Sign-out clears the expected local financial cache for that account.
- [ ] No test accounts, test transactions, developer menus, fake subscription states, or debug logs appear to normal users.

### Quality evidence

- [ ] Crash-free Internal/Closed test completed with no release-blocking crash.
- [ ] Tested on at least one low/mid-range Android phone and one newer phone.
- [ ] Tested Android system back navigation, permission-denial paths, rotation if supported, and font scaling.
- [ ] Tested with network off/on, low battery mode, and app kill/relaunch.
- [ ] No credential, token, API key, secret, or production user data is embedded in the AAB or screenshots.
- [ ] All third-party SDKs are inventoried: `____________________________`.

---

## 4. Privacy, data safety, and user data

### Privacy policy

- [ ] **BLOCKER** A public, stable **HTTPS** privacy-policy URL is live: `____________________________`.
- [ ] **BLOCKER** The policy is linked inside WalletTrails and supplied in Play Console.
- [ ] The policy accurately covers account information, financial records, wallets, transactions, bills, reports, Household information, and support messages.
- [ ] The policy explains offline storage and synchronization.
- [ ] The policy explains biometric / device-credential amount unlock without claiming WalletTrails stores biometrics.
- [ ] The policy explains notifications, push tokens, and reminder behavior.
- [ ] The policy explains analytics and diagnostics, including PostHog if enabled.
- [ ] The policy explains bank SMS / notification import if shipped.
- [ ] The policy states how a user can request account and data deletion.
- [ ] The support/deletion channel is monitored and a deletion-request process has an owner.

### Data Safety form

- [ ] **BLOCKER** The Play Console **Data safety** form is complete before Closed, Open, or Production testing. Internal-only testing is the exception.
- [ ] Every data type collected by WalletTrails and every enabled SDK has been reviewed against actual network traffic and backend behavior.
- [ ] Account identifiers (for example email, name, username) are declared if collected.
- [ ] Financial information stored or transmitted for app functionality is declared accurately.
- [ ] App activity, diagnostics, device identifiers, and analytics are declared if the app or any SDK collects/shares them.
- [ ] “Collected” versus “shared” answers have been checked against each service provider’s actual handling.
- [ ] Encryption in transit is declared only if all relevant network traffic uses it.
- [ ] Deletion availability is declared only if the documented process actually works.
- [ ] The Data safety answers match the privacy policy and the real app behavior exactly.
- [ ] A future change to analytics, ads, payments, bank import, or sharing will trigger a review of this form and policy.

**WalletTrails data inventory sign-off**

| Area | Data / service reviewed | Result / owner |
|---|---|---|
| Authentication | Email, username, password/reset data | `________________` |
| Financial records | Wallets, transactions, bills, reports | `________________` |
| Household | Members, shared entries, invite data | `________________` |
| Notifications | Push token, reminder preferences | `________________` |
| Analytics | PostHog events / identifiers | `________________` |
| Support | Messages, attachments if any | `________________` |

---

## 5. SMS, bank alerts, and other sensitive permissions

> **WalletTrails launch decision required:** the current app configuration includes `READ_SMS` and `RECEIVE_SMS`. Do not upload a Play build until one of the two paths below is complete.

### Path A — Ship SMS-based money management

Choose this only if bank-SMS parsing is a critical, implemented feature and the team can comply with Google’s restricted SMS policy.

- [x] WalletTrails implements optional Android bank-SMS detection, financial-alert parsing, a manual paste fallback, and a review queue before a transaction is posted by default.
- [x] OTP and marketing messages are filtered by the parser; the feature is designed around bank transaction alerts.
- [ ] The product description prominently describes the bank-SMS money-management feature as core functionality.
- [ ] The app uses SMS data only for the approved **SMS-based money management** purpose.
- [ ] The app restricts processing to financial / transactional SMS needed for money tracking.
- [ ] The app does not collect, upload, sell, share, profile, or use unrelated personal SMS data for advertising or analytics.
- [ ] An in-app prominent disclosure appears immediately before the permission request and clearly explains what is read, why, and how the user benefits.
- [ ] Explicit user consent is collected before SMS access.
- [ ] A no-SMS path remains usable; permission denial is handled without a crash or misleading screen.
- [ ] The Permissions Declaration Form is completed accurately in Play Console.
- [ ] Reviewer instructions show how to reach the feature with a demo account.
- [ ] A short unlisted video demonstrates enabling the feature, importing a sample financial alert, and approving the resulting draft.
- [ ] The privacy policy and Data safety form explicitly cover this permission and data flow.
- [ ] The team has read the current SMS/Call Log policy and accepts the possibility of extended review or rejection.

### Path B — Safer v1 without broad SMS permissions

Choose this if the feature is optional or the declaration cannot be fully substantiated.

- [x] A user-initiated manual bank-alert paste/import path already exists and can remain available without broad SMS permissions.
- [ ] `READ_SMS` and `RECEIVE_SMS` are removed from the final production manifest / Expo configuration.
- [ ] The resulting AAB has been checked in Play Console’s App bundle explorer to confirm those permissions are absent.
- [ ] Bank import is postponed, implemented with a policy-compliant alternative, or limited to user-initiated manual paste/import.
- [ ] Store copy, screenshots, privacy policy, and Data safety answers do not promise broad SMS reading.

### Notification listener and other permissions

- [x] Notification access is optional and restricted in code to the Bank alerts feature / bank-app allowlist. A live-device permission-flow test is still required.
- [x] Android SMS permission is requested only after the user taps the Bank alerts opt-in action.
- [ ] Every requested Android permission has a written purpose: `____________________________`.
- [ ] Permission-denial, revoke, and “Don’t ask again” flows were tested.

---

## 6. Play Console App content declarations

- [ ] **BLOCKER** App access is completed.
- [ ] A valid reusable reviewer/demo account exists if login is required.
- [ ] Reviewer credentials are in English, work from any location, and do not require a one-time OTP.
- [ ] Reviewer instructions explain login, any privacy PIN, and how to access all restricted features.
- [ ] The test account contains safe sample data and no real user financial information.
- [ ] If a premium/paywall feature exists, reviewers can access it free of charge with clear instructions.
- [ ] **BLOCKER** Ads declaration is completed: `Contains ads / Does not contain ads`.
- [ ] If ads ship, the declaration, Data safety form, privacy policy, SDK inventory, and in-app behavior all agree.
- [ ] **BLOCKER** Content rating questionnaire is completed and its answers reflect the released app and ads.
- [ ] **BLOCKER** Target audience and content declaration is completed; WalletTrails is not presented as a children’s app.
- [ ] News declaration is completed: WalletTrails is not a news app unless this changes.
- [ ] Government declaration is completed: WalletTrails is not a government app unless this changes.
- [ ] **BLOCKER** Financial features declaration is completed.
- [ ] The financial declaration describes WalletTrails as money-management/support functionality only; it must not claim banking, lending, payments, trading, investment advice, or a wallet service unless the app actually provides and is authorized for them.
- [ ] If the app ever offers personal loans, lending, payments, investments, or regulated financial services, legal/compliance review and country-specific documents are completed before release.

---

## 7. Store listing assets and copy

### Required publishing assets

- [ ] **BLOCKER** High-resolution app icon uploaded: 512 × 512, 32-bit PNG with alpha, maximum 1 MB.
- [ ] **BLOCKER** Feature graphic uploaded: 1024 × 500, JPEG or 24-bit PNG, no alpha.
- [ ] **BLOCKER** At least two phone screenshots are uploaded.
- [ ] Screenshots are JPEG or 24-bit PNG with no alpha, each side between 320 px and 3840 px, and with a longest side no more than twice the shortest side.
- [ ] Screenshots use the actual WalletTrails interface—not concepts or features that have not shipped.
- [ ] Screenshots have no personal data, passwords, API keys, real bank account numbers, or misleading “guaranteed savings” claims.
- [ ] The WT logo and colors are consistent between the app icon, feature graphic, screenshots, and listing.

### Store copy

- [ ] **BLOCKER** App name is final: `WalletTrails`.
- [ ] **BLOCKER** Short description is 80 characters or fewer.
- [ ] Full description is 4,000 characters or fewer.
- [ ] Copy accurately describes wallets, income/expenses, bills, reports, privacy controls, offline use, Household, and Travel Mode only when those features are in the release.
- [ ] Copy does not state or imply automatic bank connections, investing returns, loan approval, guaranteed savings, or financial advice if WalletTrails does not provide them.
- [ ] Copy does not include ranking claims, price promotions, keyword spam, deceptive comparisons, or competitor names.
- [ ] Contact email is entered and tested.
- [ ] Privacy-policy URL is entered and opens on a phone without login.
- [ ] App category is selected after review (likely **Finance**).
- [ ] Countries/regions and availability are deliberately selected.
- [ ] Pricing is confirmed: `Free / Paid / In-app purchases / Subscriptions`.

### Asset sign-off

| Asset | File / link | Reviewed by | Approved |
|---|---|---|---|
| Store icon | `________________` | `________________` | `[ ]` |
| Feature graphic | `________________` | `________________` | `[ ]` |
| Screenshot 1 | `________________` | `________________` | `[ ]` |
| Screenshot 2 | `________________` | `________________` | `[ ]` |
| Screenshot 3–8 | `________________` | `________________` | `[ ]` |
| Short description | `________________` | `________________` | `[ ]` |
| Full description | `________________` | `________________` | `[ ]` |

---

## 8. Testing and staged rollout plan

### Internal testing

- [ ] Upload the first AAB to Internal testing.
- [ ] Add founders/developers as internal testers.
- [ ] Install from the Play opt-in link—not only through Expo Go or a sideloaded APK.
- [ ] Confirm the version, app icon, signing, deep links, notifications, backend connection, and update behavior.
- [ ] Record and fix all blocker issues.

### Closed testing

- [ ] Create the Closed testing track and tester list.
- [ ] Send tester opt-in instructions and a feedback form.
- [ ] Track tester opt-in dates and keep the required group enrolled continuously.
- [ ] Triage feedback into: crash, data correctness, privacy/security, usability, and future improvement.
- [ ] Build and upload a new AAB for every material fix; do not reuse a version code.
- [ ] Re-run the smoke-test checklist after each release candidate.

### Production

- [ ] Production access has been granted where required.
- [ ] Every Play Console task shows complete / no outstanding policy issue.
- [ ] Final reviewer credentials have been re-tested just before submission.
- [ ] Start with a staged rollout percentage: `_____ %`.
- [ ] Define who watches crash reports, Play policy emails, reviews, support email, and backend errors during the first 72 hours.
- [ ] Define rollback owner and rollback decision rule: `____________________________`.
- [ ] Increase rollout only after no material crash, privacy, data-loss, or policy issue is observed.

---

## 9. First-week operations checklist

- [ ] Monitor Play Console policy status and Android vitals daily.
- [ ] Monitor backend error logs, failed syncs, authentication failures, and notification delivery.
- [ ] Reply to support messages and reviews using the support process promised in the listing.
- [ ] Keep reviewer/demo credentials valid until review is complete.
- [ ] Preserve a copy of every submitted AAB, release note, declaration answer, screenshot, and privacy-policy revision.
- [ ] Do not change permissions, data use, ads, pricing, or major claims without updating the relevant Play declarations first.
- [ ] Prepare a hotfix process: version bump → production AAB → Internal test → staged production update.

---

## 10. Recommended launch order

1. [ ] Complete developer identity/device verification and create the WalletTrails app entry in Play Console.
2. [ ] Make the public privacy-policy URL live and verify the deletion/support route.
3. [ ] Decide the SMS path: fully compliant SMS-based money management with evidence, or remove broad SMS permissions for v1.
4. [ ] Finalize store icon, feature graphic, screenshots, short description, full description, and reviewer account.
5. [ ] Produce a production AAB with EAS and upload it to Internal testing.
6. [ ] Complete App content, Data safety, content rating, financial features, ads, app access, and target-audience forms.
7. [ ] Run Closed testing if the account is subject to the new-Personal-account requirement.
8. [ ] Apply for Production access when eligible, then submit a staged Production rollout.
9. [ ] Watch vitals, support, policy status, and backend health; increase rollout only when stable.

---

## 11. Official sources to re-check before release

Google changes Play requirements regularly. Re-open these sources immediately before submitting the AAB:

- [Target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859455)
- [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [App testing for new Personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Developer identity verification](https://support.google.com/googleplay/android-developer/answer/10841920)
- [Device verification for new developer accounts](https://support.google.com/googleplay/android-developer/answer/14316361)
- [Permissions declaration](https://support.google.com/googleplay/android-developer/answer/9214102)
- [SMS and Call Log permissions policy](https://support.google.com/googleplay/android-developer/answer/10208820)
- [Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271)
- [Preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Sign-in details for app review](https://support.google.com/googleplay/android-developer/answer/15748846)

This checklist is a release-management tool, not legal advice. For regulated financial products, lending, payments, investing, or country-specific requirements, obtain qualified legal/compliance advice before launch.
