import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { apiErrorMessage, peopleApi } from '../api/client'

type Mode = 'local' | 'invite' | 'code'

type DoneResult =
  | { kind: 'local'; personId: number; name: string }
  | { kind: 'invite' }
  | { kind: 'join' }

type Props = {
  open: boolean
  onClose: () => void
  onDone: (result: DoneResult) => void
  existingPersonId?: number | null
  defaultDisplayName?: string
}

export default function InvitePersonModal({
  open,
  onClose,
  onDone,
  existingPersonId = null,
  defaultDisplayName = '',
}: Props) {
  const convertMode = Boolean(existingPersonId)
  const [mode, setMode] = useState<Mode>('local')
  const [localName, setLocalName] = useState('')
  const [query, setQuery] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [myCode, setMyCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeBusy, setCodeBusy] = useState(false)
  const [error, setError] = useState('')

  const loadCode = useCallback(async () => {
    setCodeBusy(true)
    try {
      const { data } = await peopleApi.linkCode()
      setMyCode((data as { code?: string })?.code || '')
    } catch {
      setMyCode('')
    } finally {
      setCodeBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setError('')
    setLocalName('')
    setQuery('')
    setDisplayName(defaultDisplayName || '')
    setJoinCode('')
    setMode(convertMode ? 'invite' : 'local')
    void loadCode()
  }, [open, loadCode, convertMode, defaultDisplayName])

  if (!open) return null

  const submitLocal = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = localName.trim()
    if (!n) {
      setError('Enter a person name.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await peopleApi.create({ name: n })
      const person = data as { id: number; name?: string }
      onDone({ kind: 'local', personId: person.id, name: person.name || n })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create person.'))
    } finally {
      setLoading(false)
    }
  }

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) {
      setError('Enter their email or username.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await peopleApi.invite({
        query: q,
        display_name: displayName.trim() || undefined,
        ...(existingPersonId ? { existing_person_id: existingPersonId } : {}),
      })
      onDone({ kind: 'invite' })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send link request.'))
    } finally {
      setLoading(false)
    }
  }

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setError('Enter a people link code.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await peopleApi.joinByCode({
        code,
        display_name: displayName.trim() || undefined,
        ...(existingPersonId ? { existing_person_id: existingPersonId } : {}),
      })
      onDone({ kind: 'join' })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not request link with that code.'))
    } finally {
      setLoading(false)
    }
  }

  const shareCode = async () => {
    if (!myCode) return
    const message = `Link with me on WalletTrails for lend/borrow. My code: ${myCode}`
    try {
      if (navigator.share) {
        await navigator.share({ text: message })
      } else {
        await navigator.clipboard.writeText(myCode)
      }
    } catch {
      try {
        await navigator.clipboard.writeText(myCode)
      } catch {
        /* ignore */
      }
    }
  }

  const regenerate = async () => {
    setCodeBusy(true)
    setError('')
    try {
      const { data } = await peopleApi.regenerateLinkCode()
      setMyCode((data as { code?: string })?.code || '')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not regenerate code.'))
    } finally {
      setCodeBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h2>{convertMode ? 'Link this person' : 'Add person'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="add-tx-seg" style={{ marginBottom: '0.85rem' }}>
          {(convertMode
            ? [
                { key: 'invite' as const, label: 'Invite user' },
                { key: 'code' as const, label: 'Code' },
              ]
            : [
                { key: 'local' as const, label: 'Local' },
                { key: 'invite' as const, label: 'Invite user' },
                { key: 'code' as const, label: 'Code' },
              ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              className={mode === t.key ? 'active' : ''}
              onClick={() => { setMode(t.key); setError('') }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error ? <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</div> : null}

        {convertMode ? (
          <p className="page-subtitle" style={{ margin: '0 0 0.75rem' }}>
            Keep this person’s history and invite a WalletTrails user to link.
          </p>
        ) : null}

        {mode === 'local' && !convertMode ? (
          <form onSubmit={submitLocal} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="page-subtitle" style={{ margin: 0 }}>
              For people not on WalletTrails (e.g. Idrees). You post entries alone.
            </p>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Idrees"
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create local person'}
            </button>
          </form>
        ) : null}

        {mode === 'invite' ? (
          <form onSubmit={submitInvite} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Type their WalletTrails email or username. They’ll get a link request to accept.
            </p>
            <div className="form-group">
              <label>Email or username</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="hussain@mail.com"
                autoCapitalize="off"
                autoFocus
                required
              />
            </div>
            <div className="form-group">
              <label>Name on your list (optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Hussain"
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Send link request'}
            </button>
          </form>
        ) : null}

        {mode === 'code' ? (
          <form onSubmit={submitJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Share your code, or enter theirs to request a link.
            </p>
            <div className="people-code-card">
              <div className="travel-muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Your code
              </div>
              <div className="people-code-value">
                {codeBusy && !myCode ? <span className="spinner spinner-dark" /> : (myCode || '—')}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button type="button" className="btn-primary" style={{ padding: '0.45rem 0.9rem' }} onClick={() => void shareCode()} disabled={!myCode}>
                  Share / Copy
                </button>
                <button type="button" className="btn-glass" onClick={() => void regenerate()} disabled={codeBusy}>
                  New code
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Their code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="PEEP-XXXXXX"
                autoCapitalize="characters"
                required
              />
            </div>
            <div className="form-group">
              <label>Name on your list (optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Hussain"
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Request link with code'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
