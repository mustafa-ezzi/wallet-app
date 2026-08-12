import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Plane, RefreshCw } from 'lucide-react'
import { countryForCurrency, formatRateLine, todayISO, TRAVEL_CURRENCIES } from '../travel/currencies'
import { useTravelMode } from '../travel/TravelModeContext'

export default function TravelModePage() {
  const navigate = useNavigate()
  const { travel, loading, saving, setTravel, fetchQuote, isActive, refresh } = useTravelMode()

  const [setupOpen, setSetupOpen] = useState(false)
  const [currency, setCurrency] = useState('AED')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteNote, setQuoteNote] = useState('')

  useEffect(() => {
    if (travel.enabled && travel.travel_currency) {
      setCurrency(travel.travel_currency.toUpperCase())
      setRate(travel.rate != null ? String(Number(travel.rate)) : '')
      if (travel.start_date) setStartDate(travel.start_date)
      if (travel.end_date) setEndDate(travel.end_date)
      setSetupOpen(true)
    }
  }, [travel])

  const loadLiveRate = useCallback(async (code: string, force = false) => {
    setQuoteBusy(true)
    setQuoteNote('')
    setError('')
    try {
      const q = await fetchQuote(code, force)
      setRate(String(Number(q.rate)))
      setQuoteNote(
        q.stale
          ? `Saved rate (${q.source}) — live feed unavailable`
          : `Live rate · ${q.source}`,
      )
    } catch {
      setQuoteNote('Could not fetch live rate — type your booth rate.')
    } finally {
      setQuoteBusy(false)
    }
  }, [fetchQuote])

  useEffect(() => {
    if (!setupOpen && !isActive) return
    if (rate) return
    void loadLiveRate(currency)
  }, [setupOpen, isActive, currency]) // eslint-disable-line react-hooks/exhaustive-deps

  const onCurrencyChange = (code: string) => {
    setCurrency(code)
    setRate('')
    void loadLiveRate(code)
  }

  const turnOn = () => {
    setSetupOpen(true)
    setError('')
    if (!rate) void loadLiveRate(currency)
  }

  const saveTrip = async () => {
    setError('')
    const r = parseFloat(rate)
    if (!Number.isFinite(r) || r <= 0) {
      setError('Enter a valid exchange rate (PKR per 1 foreign unit).')
      return
    }
    if (endDate && endDate < startDate) {
      setError('End date must be on or after start date.')
      return
    }
    try {
      await setTravel({
        enabled: true,
        travel_currency: currency,
        rate: r,
        rate_source: quoteNote.startsWith('Live') ? 'live' : 'manual',
        start_date: startDate,
        end_date: endDate || null,
      })
      navigate(-1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const turnOff = async () => {
    setError('')
    try {
      await setTravel({ enabled: false })
      setSetupOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off.')
    }
  }

  const showSetup = setupOpen || isActive

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Travel Mode</h1>
          <p className="page-subtitle">
            Type foreign amounts on Add Transaction; books stay in PKR.
          </p>
        </div>
        <label className="travel-toggle">
          <span>{isActive ? 'ON' : 'Off'}</span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              if (e.target.checked) turnOn()
              else void turnOff()
            }}
          />
        </label>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner spinner-dark" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : !showSetup ? (
        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <Plane size={40} strokeWidth={1.5} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
          <h2 style={{ margin: '0 0 0.5rem' }}>Heading abroad?</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
            Turn on Travel Mode to enter AED, USD, and more. CashTrail converts and saves PKR.
          </p>
          <button type="button" className="btn-primary" onClick={turnOn}>
            Set up Travel Mode
          </button>
        </div>
      ) : (
        <div className="glass" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="travel-from-to">
            <div>
              <div className="travel-muted">From</div>
              <strong>PKR</strong>
              <div className="travel-muted">Pakistan</div>
            </div>
            <ArrowLeftRight size={18} />
            <div>
              <div className="travel-muted">To</div>
              <strong>{currency}</strong>
              <div className="travel-muted">{countryForCurrency(currency)}</div>
            </div>
          </div>

          {rate && Number(rate) > 0 ? (
            <div className="travel-rate-line">
              {formatRateLine(currency, rate)}
              {quoteNote ? <span className="travel-muted"> · {quoteNote}</span> : null}
            </div>
          ) : null}

          <div className="form-group">
            <label>Travel currency</label>
            <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
              {TRAVEL_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.country}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Rate (PKR per 1 {currency})</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 73.26"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-glass"
                disabled={quoteBusy}
                onClick={() => void loadLiveRate(currency, true)}
                title="Refresh live rate"
              >
                <RefreshCw size={16} className={quoteBusy ? 'spin' : undefined} />
              </button>
            </div>
            <p className="page-subtitle" style={{ marginTop: 6 }}>
              Use the live mid-market rate, or type what your exchange booth gave you.
            </p>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label>Travel start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Travel end date</label>
              <input
                type="date"
                value={endDate || startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <p className="page-subtitle" style={{ marginTop: -8 }}>
            End date optional — clear it for an open-ended trip.
            {endDate ? (
              <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={() => setEndDate('')}>
                Clear end
              </button>
            ) : null}
          </p>

          <button type="button" className="btn-primary" style={{ width: '100%' }} disabled={saving} onClick={() => void saveTrip()}>
            {saving ? <span className="spinner" /> : 'Update Travel Mode'}
          </button>

          {isActive ? (
            <button type="button" className="btn-danger-text" onClick={() => void turnOff()}>
              Turn off Travel Mode
            </button>
          ) : null}

          <button type="button" className="link-btn" onClick={() => void refresh()}>
            Refresh status
          </button>
        </div>
      )}
    </div>
  )
}
