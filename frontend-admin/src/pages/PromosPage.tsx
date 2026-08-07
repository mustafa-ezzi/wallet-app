import { useEffect, useState, type FormEvent } from 'react'
import { createPromo, fetchPromos, patchPromo, type OpsPromo } from '../api'

export function PromosPage() {
  const [rows, setRows] = useState<OpsPromo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [trialDays, setTrialDays] = useState('30')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [productId, setProductId] = useState('premium_monthly')
  const [note, setNote] = useState('')

  async function load() {
    setError(null)
    try {
      const data = await fetchPromos({ page_size: 50 })
      setRows(data.results)
    } catch {
      setError('Failed to load promo codes.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createPromo({
        code: code.trim().toUpperCase(),
        product_id: productId,
        trial_days: Number(trialDays) || 30,
        max_redemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
        note: note.trim() || undefined,
      })
      setCode('')
      setNote('')
      setMaxRedemptions('')
      await load()
    } catch {
      setError('Could not create promo (code may already exist).')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p: OpsPromo) {
    setBusy(true)
    try {
      await patchPromo(p.id, { active: !p.active })
      await load()
    } catch {
      setError('Update failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Promo codes</h1>
          <p>Users redeem in the app → Premium trial (source=promo).</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Create code</h2>
        <form onSubmit={(e) => void onCreate(e)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input
            placeholder="PREMIUM30"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            style={{ minWidth: 140 }}
          />
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="premium_monthly">Monthly product</option>
            <option value="premium_yearly">Yearly product</option>
            <option value="premium_lifetime">Lifetime</option>
          </select>
          <input
            type="number"
            min={1}
            placeholder="Days"
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            style={{ width: 88 }}
          />
          <input
            type="number"
            min={1}
            placeholder="Max uses (blank=∞)"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            Create
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Days</th>
              <th>Uses</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No promo codes yet.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.code}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {p.product_id}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </td>
                  <td>{p.product_id === 'premium_lifetime' ? '∞' : p.trial_days}</td>
                  <td>
                    {p.redemption_count}
                    {p.max_redemptions != null ? ` / ${p.max_redemptions}` : ''}
                  </td>
                  <td>
                    {p.is_valid_now ? (
                      <span className="badge ok">valid</span>
                    ) : p.active ? (
                      <span className="badge warn">exhausted/expired</span>
                    ) : (
                      <span className="badge">off</span>
                    )}
                  </td>
                  <td>
                    <button className="btn" type="button" disabled={busy} onClick={() => void toggleActive(p)}>
                      {p.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
