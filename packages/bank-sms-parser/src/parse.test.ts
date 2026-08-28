import { describe, expect, it } from 'vitest'
import { buildApproveDraft, buildApprovePlan } from './approvePlan'
import { applyKindOverrides } from './corrections'
import { FIXTURE_SMS } from './fixtures'
import { needsManualTypePick, preferCashWallet, suggestBankWallet } from './matchWallet'
import { parseBankSms } from './parse'
import { suggestPeopleMatch } from './suggestPeople'

describe('parseBankSms — product samples', () => {
  it('classifies ATM with TID as atm', () => {
    const f = FIXTURE_SMS.find((x) => x.id === 'product-atm-tid')!
    const p = parseBankSms(f.text)
    expect(p.ignore).toBe(false)
    expect(p.kind).toBe('atm')
    expect(p.amount).toBe(50000)
    expect(p.tid).toBe('302750')
    expect(p.date).toBe('2026-08-20')
  })

  it('classifies debit without TID as expense', () => {
    const f = FIXTURE_SMS.find((x) => x.id === 'product-card-debit')!
    const p = parseBankSms(f.text)
    expect(p.kind).toBe('expense')
    expect(p.amount).toBe(2041)
    expect(p.tid).toBeNull()
  })

  it('classifies RAAST sent as expense even with TID', () => {
    const f = FIXTURE_SMS.find((x) => x.id === 'product-raast-sent')!
    const p = parseBankSms(f.text)
    expect(p.kind).toBe('expense')
    expect(p.amount).toBe(230)
    expect(p.counterparty).toMatch(/SHAKIR/i)
    expect(p.tid).toBe('633081')
  })

  it('classifies received as income', () => {
    const f = FIXTURE_SMS.find((x) => x.id === 'product-raast-received')!
    const p = parseBankSms(f.text)
    expect(p.kind).toBe('income')
    expect(p.amount).toBe(141000)
  })

  it('classifies reversed as reversal', () => {
    const f = FIXTURE_SMS.find((x) => x.id === 'product-reversed')!
    const p = parseBankSms(f.text)
    expect(p.kind).toBe('reversal')
    expect(p.amount).toBe(3147)
  })
})

describe('parseBankSms — fixtures pack', () => {
  for (const f of FIXTURE_SMS) {
    it(`${f.id}: ${f.label}`, () => {
      const p = parseBankSms(f.text)
      if (f.expectedKind === 'ignore') {
        expect(p.ignore).toBe(true)
        return
      }
      expect(p.ignore).toBe(false)
      expect(p.kind).toBe(f.expectedKind)
      if (f.expectedAmount != null) expect(p.amount).toBe(f.expectedAmount)
    })
  }
})

describe('wallet suggest + approve plan', () => {
  const wallets = [
    { id: 1, name: 'Meezan Current', type: 'bank' },
    { id: 2, name: 'Cash', type: 'cash' },
    { id: 3, name: 'HBL', type: 'bank' },
  ]

  it('suggests bank by hint', () => {
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'hint-meezan-debit')!.text)
    expect(suggestBankWallet(wallets, p)?.id).toBe(1)
  })

  it('prefers alias mask over name fuzzy', () => {
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'hint-account-mask')!.text)
    const aliases = [{ account_id: 3, mask: '2554' }]
    expect(suggestBankWallet(wallets, p, aliases)?.id).toBe(3)
  })

  it('prefers alias hint', () => {
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'hint-meezan-debit')!.text)
    const aliases = [{ account_id: 3, hint: 'meezan' }]
    expect(suggestBankWallet(wallets, p, aliases)?.id).toBe(3)
  })

  it('prefers named Cash wallet', () => {
    expect(preferCashWallet(wallets)?.id).toBe(2)
  })

  it('prefers default Cash wallet id when set', () => {
    const multiCash = [
      ...wallets,
      { id: 9, name: 'Petty Cash', type: 'cash' },
    ]
    expect(preferCashWallet(multiCash, 9)?.id).toBe(9)
  })

  it('needsManualTypePick for unknown / low confidence', () => {
    expect(needsManualTypePick({ kind: 'unknown', confidence: 0.9 })).toBe(true)
    expect(needsManualTypePick({ kind: 'expense', confidence: 0.4 })).toBe(true)
    expect(needsManualTypePick({ kind: 'expense', confidence: 0.8 })).toBe(false)
  })

  it('ATM plan creates bank→cash transfer steps', () => {
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'product-atm-tid')!.text)
    const draft = buildApproveDraft(p, wallets)
    expect(draft.kind).toBe('atm')
    const plan = buildApprovePlan(draft)
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0].category).toBe('Bank Transfer')
    expect(plan.steps[0].accountRole).toBe('bank')
    expect(plan.steps[1].accountRole).toBe('cash')
    expect(plan.createCashNamed).toBeNull()
  })

  it('ATM without cash asks to create Cash', () => {
    const banksOnly = wallets.filter((w) => w.type === 'bank')
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'product-atm-tid')!.text)
    const draft = buildApproveDraft(p, banksOnly)
    const plan = buildApprovePlan(draft)
    expect(plan.createCashNamed).toBe('Cash')
    expect(plan.steps[1].accountId).toBeNull()
  })

  it('expense plan is a single expense step', () => {
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'product-card-debit')!.text)
    const draft = buildApproveDraft(p, wallets)
    const plan = buildApprovePlan(draft)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].type).toBe('expense')
  })
})

describe('phase 5 — corrections, templates, people', () => {
  it('applies kind override by mask', () => {
    const p = parseBankSms(FIXTURE_SMS.find((x) => x.id === 'hint-account-mask')!.text)
    expect(p.kind).toBe('expense')
    const forced = applyKindOverrides(p, [{ kind: 'atm', mask: '2554' }])
    expect(forced.kind).toBe('atm')
    expect(forced.reason).toMatch(/override/)
  })

  it('parseBankSms accepts kindOverrides option', () => {
    const p = parseBankSms(
      FIXTURE_SMS.find((x) => x.id === 'hint-meezan-debit')!.text,
      { kindOverrides: [{ kind: 'income', hint: 'meezan' }] },
    )
    expect(p.kind).toBe('income')
  })

  it('suggestPeopleMatch finds unique person', () => {
    const hit = suggestPeopleMatch('M.SHAKIR', [
      { id: 1, name: 'M Shakir' },
      { id: 2, name: 'Ali' },
    ])
    expect(hit?.id).toBe(1)
  })

  it('hard-filters verification / promo SMS', () => {
    for (const id of [
      'ignore-verification-code',
      'ignore-declined',
      'ignore-promo-offer',
      'ignore-zong-dbazar',
      'ignore-telco-per-day',
    ]) {
      const f = FIXTURE_SMS.find((x) => x.id === id)!
      expect(parseBankSms(f.text).ignore).toBe(true)
    }
  })
})
