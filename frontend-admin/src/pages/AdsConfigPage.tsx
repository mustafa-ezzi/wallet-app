import { useEffect, useState } from 'react'
import { fetchOpsConfig, patchOpsConfig, type OpsRemoteConfig } from '../api'

export function AdsConfigPage() {
  const [cfg, setCfg] = useState<OpsRemoteConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [adsEnabled, setAdsEnabled] = useState(true)
  const [banner, setBanner] = useState(true)
  const [interstitial, setInterstitial] = useState(false)
  const [rewarded, setRewarded] = useState(false)
  const [premiumHides, setPremiumHides] = useState(true)
  const [bannerUnit, setBannerUnit] = useState('')
  const [interstitialUnit, setInterstitialUnit] = useState('')
  const [rewardedUnit, setRewardedUnit] = useState('')
  const [showAfter, setShowAfter] = useState('3')
  const [intervalSec, setIntervalSec] = useState('180')
  const [countries, setCountries] = useState('PK')
  const [testDevices, setTestDevices] = useState('')
  const [minVersion, setMinVersion] = useState('')
  const [storeUrl, setStoreUrl] = useState('')
  const [maintenance, setMaintenance] = useState('')

  function applyForm(data: OpsRemoteConfig) {
    const r = data.raw
    setAdsEnabled(r.ads_enabled)
    setBanner(r.banner_enabled)
    setInterstitial(r.interstitial_enabled)
    setRewarded(r.rewarded_enabled)
    setPremiumHides(r.premium_hides_ads)
    setBannerUnit(r.android_banner_unit || '')
    setInterstitialUnit(r.android_interstitial_unit || '')
    setRewardedUnit(r.android_rewarded_unit || '')
    setShowAfter(String(r.show_after_sessions ?? 3))
    setIntervalSec(String(r.interstitial_min_interval_sec ?? 180))
    setCountries((r.countries || []).join(','))
    setTestDevices((r.test_device_ids || []).join(','))
    setMinVersion(r.min_supported_version || '')
    setStoreUrl(r.store_url || '')
    setMaintenance(r.maintenance_message || '')
  }

  async function load() {
    setError(null)
    try {
      const data = await fetchOpsConfig()
      setCfg(data)
      applyForm(data)
    } catch {
      setError('Failed to load ads config.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const data = await patchOpsConfig({
        ads_enabled: adsEnabled,
        banner_enabled: banner,
        interstitial_enabled: interstitial,
        rewarded_enabled: rewarded,
        premium_hides_ads: premiumHides,
        android_banner_unit: bannerUnit.trim(),
        android_interstitial_unit: interstitialUnit.trim(),
        android_rewarded_unit: rewardedUnit.trim(),
        show_after_sessions: Number(showAfter) || 0,
        interstitial_min_interval_sec: Number(intervalSec) || 0,
        countries,
        test_device_ids: testDevices,
        min_supported_version: minVersion.trim(),
        store_url: storeUrl.trim(),
        maintenance_message: maintenance.trim(),
      })
      setCfg(data)
      applyForm(data)
      setSaved('Saved. Apps pick this up on next config fetch.')
    } catch {
      setError('Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function killSwitch() {
    if (!window.confirm('Disable ALL ads immediately?')) return
    setBusy(true)
    try {
      const data = await patchOpsConfig({ ads_enabled: false })
      setCfg(data)
      applyForm(data)
      setSaved('Ads kill switch ON — ads_enabled=false.')
    } catch {
      setError('Kill switch failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Ads & Config</h1>
          <p>Remote AdMob kill switch, unit IDs, and premium hides ads.</p>
        </div>
        <button className="btn" type="button" disabled={busy} onClick={() => void killSwitch()}>
          Kill all ads
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="note">{saved}</p> : null}

      {!cfg ? (
        <p className="muted">Loading…</p>
      ) : (
        <form onSubmit={(e) => void onSave(e)}>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Ad toggles</h2>
            <label className="check">
              <input type="checkbox" checked={adsEnabled} onChange={(e) => setAdsEnabled(e.target.checked)} />
              Ads master enabled
            </label>
            <label className="check">
              <input type="checkbox" checked={banner} onChange={(e) => setBanner(e.target.checked)} />
              Banner
            </label>
            <label className="check">
              <input type="checkbox" checked={interstitial} onChange={(e) => setInterstitial(e.target.checked)} />
              Interstitial
            </label>
            <label className="check">
              <input type="checkbox" checked={rewarded} onChange={(e) => setRewarded(e.target.checked)} />
              Rewarded
            </label>
            <label className="check">
              <input type="checkbox" checked={premiumHides} onChange={(e) => setPremiumHides(e.target.checked)} />
              Premium users never see ads
            </label>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Android unit IDs</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Leave blank to use Google sample (test) units.
            </p>
            <label>
              Banner
              <input value={bannerUnit} onChange={(e) => setBannerUnit(e.target.value)} placeholder="ca-app-pub-…/…" />
            </label>
            <label>
              Interstitial
              <input
                value={interstitialUnit}
                onChange={(e) => setInterstitialUnit(e.target.value)}
                placeholder="ca-app-pub-…/…"
              />
            </label>
            <label>
              Rewarded
              <input value={rewardedUnit} onChange={(e) => setRewardedUnit(e.target.value)} placeholder="ca-app-pub-…/…" />
            </label>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Rules</h2>
            <label>
              Show after N sessions
              <input type="number" min={0} value={showAfter} onChange={(e) => setShowAfter(e.target.value)} />
            </label>
            <label>
              Interstitial min interval (sec)
              <input type="number" min={0} value={intervalSec} onChange={(e) => setIntervalSec(e.target.value)} />
            </label>
            <label>
              Countries (comma, e.g. PK)
              <input value={countries} onChange={(e) => setCountries(e.target.value)} />
            </label>
            <label>
              Test device IDs (comma)
              <input value={testDevices} onChange={(e) => setTestDevices(e.target.value)} />
            </label>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>App gate (Phase 5-ready)</h2>
            <label>
              Min supported version
              <input value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="1.0.0" />
            </label>
            <label>
              Store URL
              <input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} placeholder="https://play.google.com/…" />
            </label>
            <label>
              Maintenance message
              <input value={maintenance} onChange={(e) => setMaintenance(e.target.value)} />
            </label>
          </div>

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save config'}
          </button>
          {cfg.updated_at ? (
            <p className="muted" style={{ marginTop: 12 }}>
              Last updated {new Date(cfg.updated_at).toLocaleString()}
              {cfg.raw.updated_by_username ? ` by @${cfg.raw.updated_by_username}` : ''}
            </p>
          ) : null}
        </form>
      )}
    </div>
  )
}
