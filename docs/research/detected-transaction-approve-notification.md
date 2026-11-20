# WalletTrails — “Transaction detected, approve it?” notification (Android research & phases)

**Document type:** Product + engineering plan (nothing built yet)  
**Surfaces:** Android app only (`mobile/`). iOS and web keep the in-app Bank alerts inbox; they do not get this banner.  
**Related code:** `mobile/src/bankSms/ingest.ts`, `mobile/src/bankSms/headlessTask.ts`, `mobile/src/bankSms/nativeNotification.ts`, `mobile/src/notifications/schedule.ts`, `mobile/src/notifications/RemindersProvider.tsx`, `mobile/app.json` (`POST_NOTIFICATIONS` is already declared)  
**Builds on:** `docs/research/bank-sms-auto-detect-approve-or-reject.md` (detection and Approve already exist)  
**Reviewed:** 21 November 2026

---

## 1. What I understood

When WalletTrails detects a bank transaction (SMS or a bank-app alert), the phone should raise a **WalletTrails notification** in the shade:

1. It tells the user a new transaction was detected and asks them to approve it.
2. The same notification carries a short reminder that expenses and records need to be booked, or the books go stale.

Tapping it opens the existing review screen. The books still change only after Approve. This is a nudge on top of detection, not a new way to read SMS.

---

## 2. Verdict

**Yes. Android can do this** with the stack already in the app (`expo-notifications` + the SMS headless task). No new Play permission is required beyond notification permission, which the app already asks for (due reminders) and already lists as `POST_NOTIFICATIONS`.

What Android can and cannot guarantee:

| Situation | Can we show the banner? |
| --- | --- |
| App is open or sitting in the background with the process alive | Yes. Post it right after a new pending draft is saved. |
| App is fully closed, and the alert arrived as an **SMS** | Yes. The SMS headless task (`ExpoSmsListenerBackground` in `mobile/index.js`) already runs ingest while the app is closed. That same task can post the notification. |
| App is fully closed, and the alert arrived as a **bank-app notification** (Meezan, JazzCash, and the rest) | Only after a small native change. Today the listener stores the alert and JavaScript reads it the next time the app opens. A shade banner at that moment has to be posted from the listener service itself, because JavaScript is not running. |
| User denied notifications, or muted the channel, or an OEM (Xiaomi and similar) killed the app | The draft is still saved. The Home banner (“N alerts waiting”) remains the fallback. The shade banner will not appear. |
| iOS | No auto-detect, so no banner. Paste and the synced inbox stay as they are. |

A one-tap **Approve** that writes the books from the shade, without opening the app, is possible later and is a poor v1. The wallet or the type can be wrong, and a killed process often cannot finish the network call from a notification button. v1 opens the review screen. The button label can still say **Approve**.

---

## 3. What already exists, and the gap

| Piece | Today |
| --- | --- |
| Detect SMS, including while the app is closed | Built. `handleSmsHeadlessTask` → `ingestBankSmsBody` |
| Detect bank-app notifications | Built while JavaScript is alive. Queued natively and drained on the next open when it is not. |
| Save a pending draft and Approve / Reject | Built. `POST /api/bank-sms-imports/` returns **201** for a new draft and **200** when it is a duplicate. |
| Tell the user outside the app | Missing. The only prompt is the Home card `BankSmsAlertBanner`, which they see after they open WalletTrails. |
| Local notifications | Built for loan and bill due dates (`schedule.ts`, channel `WalletTrails-due-reminders`). The same API posts this new banner. |
| “Add automatically” | Built. When that is on and approve succeeds, there is nothing left to approve. That path must stay quiet. |

---

## 4. What the notification says

One Android channel, separate from due reminders, so the user can mute this sound and keep bill reminders.

**Channel:** `wallettrails-detected-tx`  
**Name:** Transaction alerts  
**Importance:** high (heads-up banner, sound, on the lock screen as a private notification)

### 4.1 Copy

Amounts follow the existing Hide amounts setting (`getPrivacyEnabled`). When amounts are hidden, the body omits the figure.

| Case | Title | Body |
| --- | --- | --- |
| One expense, amount visible | PKR 2,041 to book | A new transaction was detected. Approve it so this expense stays in your records. |
| One expense, amounts hidden | New expense to book | A new transaction was detected. Approve it so your expenses and records stay up to date. |
| Money in | PKR 5,000 received | A new transaction was detected. Approve it so this income is in your records. |
| ATM | PKR 10,000 cash out | A new transaction was detected. Approve it so this cash-out is in your records. |
| Several waiting (collapsed) | 3 transactions to book | New transactions were detected. Approve them so your expenses and records stay up to date. |
| Amounts hidden, any kind | New transaction to book | A new transaction was detected. Approve it so your expenses and records stay up to date. |

Buttons (Phase 4): **Approve** (opens the review for that draft) and **Not now** (dismisses the banner; the draft stays pending).

Tap on the body does the same as **Approve**.

Tone stays short. The bookkeeping line is the second sentence, every time, so the reminder is consistent.

### 4.2 What it must not include

- The raw SMS or the full bank-app text.
- Account numbers, TID, or the counterparty name (those stay on the review screen).
- A full-screen take-over. Android reserves that for alarms and calls, and Play rejects it on a finance app.

---

## 5. When it fires, and when it stays quiet

Fire only when all of these are true:

1. The user is on Android.
2. SMS auto-detect or Bank apps listening is on (the path that produced this draft).
3. The “Alert me when a transaction is detected” toggle is on (new; default on once notification permission is granted).
4. `ingestBankSmsBody` saved a **new** pending row. The create API answers **201**. A **200** means duplicate (same fingerprint, same TID, or the soft amount match) — stay quiet.
5. The row is still `pending` after the call. If “Add automatically” already approved it, stay quiet.
6. Notification permission is granted. If it is not, skip the banner and leave the Home card.

Collapse: if another detected-transaction banner is already in the shade, replace it with the “N transactions to book” copy. One banner, updated count. Due-date reminders are a different channel and are left alone.

Dismiss the banner when the user approves or rejects that draft, and when the pending count hits zero.

Deep link payload (so the existing tap handler can route it):

```ts
{
  type: 'bank_sms_review',
  importId: number,   // omitted on the collapsed “N transactions” banner
  screen: 'bank-sms',
}
```

`RemindersProvider` already listens for notification taps and routes `screen`. It needs a `bank-sms` case that opens `/bank-sms` and, when `importId` is set, focuses that draft. Due-reminder routing stays as it is.

---

## 6. Android details that decide the phases

### 6.1 Permission and channels

Android 13 and above need the user to allow notifications. That is the same permission due reminders already use. Granting reminders is enough for this banner. Denying it blocks both.

Each channel has its own importance. Creating `wallettrails-detected-tx` at high importance gives a heads-up banner. The user can later set that channel to silent in system settings. The app should offer “Open notification settings” next to the toggle when permission is denied.

The channel has to be created before the first post, including from the SMS headless task on a cold start. `ensureAndroidChannel` in `schedule.ts` is the place to add it, and the headless task must call that helper before posting.

### 6.2 App open or in the background

Call the poster at the end of a successful **201** ingest, from `BankSmsProvider` (the live SMS and bank-app listeners both end in `ingestBankSmsBody`). `scheduleNotificationAsync` with a 1-second trigger is enough. The current notification handler already sets `shouldShowBanner: true`, so the banner can appear while the user is inside the app.

### 6.3 App closed — SMS

`handleSmsHeadlessTask` already parses and saves. After a 201 pending result, it posts the same notification. Stock Android starts the process for `SMS_RECEIVED` and lets that process call `NotificationManager`. This is the same process the headless task already runs in.

Limits that match the existing SMS feature:

- The phone must be online long enough for the create API to return 201. Offline, ingest returns `create-failed` and there is no draft id to open, so there is no banner. The Home card appears after the next successful save.
- Xiaomi, Oppo, Vivo, and similar skins can block the background process. Then there is no banner until the next open. The in-app card covers that, the same way SMS detection already degrades.

### 6.4 App closed — bank-app notification

`NotificationListenerService` keeps running after the UI is gone, as long as the user granted Notification access and the OEM has not force-stopped WalletTrails. The installed module (`expo-android-notification-listener-service`) queues the payload for JavaScript. It does not post a WalletTrails notification.

To banner at that moment, the listener (native) posts a simple heads-up when the package looks like a bank or wallet app:

> New bank alert  
> A new transaction may have been detected. Open WalletTrails to approve it and keep your records.

JavaScript, on the next tick or the next open, parses it. If the parse becomes a new pending draft, it replaces that banner with the richer copy from §4.1 (amount and kind). If the parse is ignored (OTP, promo, duplicate), it cancels the simple banner.

That native post is Phase 3. It needs a small change in the listener module (or a thin fork) and an EAS rebuild. Phase 1 and Phase 2 ship the useful case — SMS, and bank apps while the process is alive — without that rebuild.

### 6.5 Buttons

`expo-notifications` categories support Android actions:

- **Approve** with `opensAppToForeground: true` — reliable. The tap starts the app and the listener routes to the draft.
- **Not now** with `opensAppToForeground: false` — dismisses. The draft stays pending.

Writing the books from **Approve** without showing the screen needs the process, the network, and a correct wallet guess. Leave that out of these phases.

### 6.6 Play and privacy

This banner describes a draft the user already opted in to detect. It adds no SMS or notification-listener permission. Privacy policy text can gain one line: WalletTrails may show a notification asking you to approve a detected transaction, and the notification shows the amount only when Hide amounts is off.

Analytics events (`detected_tx_notification_posted`, `detected_tx_notification_opened`) carry kind and source only, never the amount or the SMS body.

---

## 7. Settings

Under Settings → Bank alerts (next to the existing SMS and Bank apps toggles):

- **Alert me when a transaction is detected** — on by default when notifications are allowed.
- Short line: “We’ll ask you to approve it, with a reminder to keep your records.”
- If permission is off: **Allow notifications**, reusing `requestReminderPermission`.

Turning SMS and Bank apps both off hides the toggle, because nothing will be detected.

---

## 8. Development phases

Build in this order. Each phase is usable on its own.

### Phase 0 — This note

**Build**

- Freeze copy (§4), the quiet rules (§5), and the decision that v1 opens the review screen.
- Agree the channel id `wallettrails-detected-tx` so it never collides with `WalletTrails-due-reminders`.

**Exit:** this file is the spec. No app change.

**Status:** this document.

---

### Phase 1 — Banner while the app process is alive

**Build**

- Add the Android channel in `ensureAndroidChannel`.
- Add `notifyDetectedTransaction({ id, kind, amount, pendingCount })` in `mobile/src/notifications/`. It respects Hide amounts, collapses to one banner, and attaches the deep-link payload from §5.
- From ingest, call it only on a **new** pending draft (HTTP 201, status still `pending`). `ingestBankSmsBody` needs to tell the caller whether the row was created or deduped — today both return `{ ok: true }`.
- Route `type: 'bank_sms_review'` in `RemindersProvider` to `/bank-sms`.
- Settings toggle, default on, stored on the device (SecureStore is enough; no server field in this phase).
- A “Send test” style check is optional; a real paste or a real SMS on a dev build is the real test.

**Tests**

- Paste and live SMS with the app open: one banner, copy matches §4, tap opens Bank alerts.
- Second detection within a minute replaces the banner with “2 transactions to book”.
- Duplicate SMS (same fingerprint): no second banner.
- “Add automatically” succeeds: no banner.
- Hide amounts on: title and body contain no digits of the amount.
- Due-reminder tap still opens Bills. A detected-transaction tap opens Bank alerts.

**Exit:** with the app open or recently used, a new pending draft raises the banner and the tap lands on review.

---

### Phase 2 — Same banner when an SMS arrives and the app is closed

**Build**

- After a 201 pending ingest inside `handleSmsHeadlessTask`, call the same `notifyDetectedTransaction`.
- Create the channel at the start of the headless task.
- Keep the headless task short: post the notification and return. Do not open the UI.

**Tests**

- Force-stop is the wrong test (force-stop blocks SMS until the next manual open). Instead: swipe the app away from Recents, send a real bank SMS, confirm the banner within a few seconds, tap it, confirm the draft is on the review screen.
- Airplane mode, then an SMS: no banner, and no crash. After the network returns, the next successful ingest can banner.
- One Xiaomi or similar device, same steps, and write down whether the OEM blocked it.

**Exit:** a closed app still shows the banner for a new bank SMS on a stock or Samsung phone.

---

### Phase 3 — Bank-app alert while the app is closed

**Build**

- In the notification-listener native service, when a posted notification matches the existing bank and wallet package list, post the simple banner from §6.4.
- When JavaScript later ingests it as a new pending draft, replace that banner with the rich copy.
- When JavaScript ignores it or finds a duplicate, cancel the simple banner.
- EAS rebuild. Expo Go cannot load this module (same as Bank apps today).

**Tests**

- Swipe the app away, pay with JazzCash or receive a Meezan alert, confirm a WalletTrails banner without opening the app first.
- An OTP or promo from the same app: the simple banner disappears and no draft is created.
- SMS and the bank app both fire for one payment: one draft, one banner (the 200 dedupe path stays quiet).

**Exit:** a bank-app alert raises a WalletTrails banner even when the UI process was not running.

---

### Phase 4 — Approve and Not now buttons

**Build**

- Register a notification category with **Approve** (opens the app on that draft) and **Not now** (dismiss, draft stays).
- Wire the action id in the existing response listener.
- When the user approves or rejects inside the app, cancel the matching banner.

**Tests**

- Approve from the shade opens the right draft, including when the app was swiped away.
- Not now leaves the draft pending and clears the banner.
- The Home card still shows the count after Not now.

**Exit:** the shade itself asks the question, and both answers behave as written.

---

## 9. Acceptance for v1 (Phases 1, 2, and 4)

Phase 3 can follow the first Play release. v1 is done when:

- A new pending draft from SMS raises one WalletTrails banner with the bookkeeping sentence.
- The banner works with the app open and with the app swiped away.
- Tap and the Approve button open that draft. Not now keeps it pending.
- Duplicates and successful auto-approve stay quiet.
- Hide amounts strips the figure.
- Due reminders still fire on their own channel.
- Denying notifications leaves detection and the Home card working.

---

## 10. Open decisions

1. Default of the new toggle: on (recommended) or off until the user opts in.
2. Whether a successful “Add automatically” should post a quieter “Recorded in your books” banner. Recommended: no, so people who chose automatic are not nagged.
3. Whether Phase 3 ships in the same binary as Phase 2 or waits, because it needs a native rebuild either way once the listener module changes.
