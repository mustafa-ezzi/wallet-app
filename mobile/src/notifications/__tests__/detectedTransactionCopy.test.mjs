// Run: npm run test:detected-tx
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildDetectedTransactionContent,
  DETECTED_TX_CHANNEL_ID,
  bankAlertBannerAction,
  DETECTED_TX_ACTION_LATER,
  detectedTxTapOpensReview,
  shouldPostDetectedTxBanner,
} from '../detectedTransactionCopy.ts'

test('channel id stays off the due-reminder channel', () => {
  assert.equal(DETECTED_TX_CHANNEL_ID, 'wallettrails-detected-tx')
  assert.notEqual(DETECTED_TX_CHANNEL_ID, 'WalletTrails-due-reminders')
})

test('one expense names the amount and asks to book the expense', () => {
  const c = buildDetectedTransactionContent({
    id: 41,
    kind: 'expense',
    amountLabel: 'PKR 2,041',
    pendingCount: 1,
    source: 'android_sms',
  })
  assert.equal(c.title, 'PKR 2,041 to book')
  assert.match(c.body, /A new transaction was detected/)
  assert.match(c.body, /this expense stays in your records/)
  assert.equal(c.data.importId, 41)
  assert.equal(c.data.type, 'bank_sms_review')
  assert.equal(c.data.screen, 'bank-sms')
  assert.equal(c.data.source, 'android_sms')
})

test('income and ATM use their own lines', () => {
  const income = buildDetectedTransactionContent({
    id: 2,
    kind: 'income',
    amountLabel: 'PKR 5,000',
    pendingCount: 1,
    source: 'notification',
  })
  assert.equal(income.title, 'PKR 5,000 received')
  assert.match(income.body, /this income is in your records/)

  const reversal = buildDetectedTransactionContent({
    id: 3,
    kind: 'reversal',
    amountLabel: 'PKR 100',
    pendingCount: 1,
    source: 'android_sms',
  })
  assert.equal(reversal.title, 'PKR 100 received')

  const atm = buildDetectedTransactionContent({
    id: 4,
    kind: 'atm',
    amountLabel: 'PKR 10,000',
    pendingCount: 1,
    source: 'android_sms',
  })
  assert.equal(atm.title, 'PKR 10,000 cash out')
  assert.match(atm.body, /this cash-out is in your records/)
})

test('several waiting collapse and drop the draft id', () => {
  const c = buildDetectedTransactionContent({
    id: 9,
    kind: 'expense',
    amountLabel: 'PKR 2,041',
    pendingCount: 2,
    source: 'paste',
  })
  assert.equal(c.title, '2 transactions to book')
  assert.match(c.body, /New transactions were detected/)
  assert.equal(c.importId, undefined)
  assert.equal(c.data.importId, undefined)
  assert.equal(c.title.includes('2,041'), false)
  assert.equal(c.body.includes('2,041'), false)
})

test('hidden amounts omit every digit of the figure', () => {
  for (const kind of ['expense', 'income', 'atm', 'unknown']) {
    const c = buildDetectedTransactionContent({
      id: 7,
      kind,
      amountLabel: null,
      pendingCount: 1,
      source: 'android_sms',
    })
    const text = `${c.title}\n${c.body}`
    assert.equal(text.includes('2041'), false)
    assert.equal(text.includes('2,041'), false)
    assert.equal(/\d/.test(c.title), false, kind)
    assert.match(c.body, /expenses and records stay up to date/)
  }
  const expense = buildDetectedTransactionContent({
    id: 7,
    kind: 'expense',
    amountLabel: null,
    pendingCount: 1,
    source: 'android_sms',
  })
  assert.equal(expense.title, 'New expense to book')
})

test('Not now stays on the banner, Approve and the body open the draft', () => {
  assert.equal(detectedTxTapOpensReview(DETECTED_TX_ACTION_LATER), false)
  assert.equal(detectedTxTapOpensReview('approve'), true)
  assert.equal(detectedTxTapOpensReview('expo.modules.notifications.actions.DEFAULT'), true)
  assert.equal(detectedTxTapOpensReview(undefined), true)
})

test('bank-app placeholder is replaced only for a new pending draft', () => {
  assert.equal(bankAlertBannerAction({ source: 'notification', created: true, pending: true }), 'replace')
  assert.equal(bankAlertBannerAction({ source: 'notification', created: false, pending: true }), 'cancel')
  assert.equal(bankAlertBannerAction({ source: 'notification', created: true, pending: false }), 'cancel')
  assert.equal(bankAlertBannerAction({ source: 'android_sms', created: true, pending: true }), 'none')
  assert.equal(bankAlertBannerAction({ source: 'paste', created: false, pending: false }), 'none')
})

test('closed-app SMS posts only for a new draft that is still pending', () => {
  assert.equal(shouldPostDetectedTxBanner({ smsEnabled: true, created: true, pending: true }), true)
  assert.equal(shouldPostDetectedTxBanner({ smsEnabled: false, created: true, pending: true }), false)
  assert.equal(shouldPostDetectedTxBanner({ smsEnabled: true, created: false, pending: true }), false)
  assert.equal(shouldPostDetectedTxBanner({ smsEnabled: true, created: true, pending: false }), false)
})
