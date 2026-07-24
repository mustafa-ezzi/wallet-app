import { useEffect, useState } from 'react'

interface Props {
  /** Absolute or path join URL encoded into the QR */
  value: string
  size?: number
}

/** Renders an invite QR locally (no third-party QR API). */
export default function InviteQr({ value, size = 160 }: Props) {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const QR = await import('qrcode')
        const url = await QR.toDataURL(value, {
          width: size,
          margin: 2,
          color: { dark: '#0f3d24', light: '#ffffff' },
        })
        if (!cancelled) setDataUrl(url)
      } catch {
        if (!cancelled) setError('Could not generate QR')
      }
    })()
    return () => { cancelled = true }
  }, [value, size])

  if (error) {
    return <p className="text-muted" style={{ fontSize: '0.78rem' }}>{error}</p>
  }
  if (!dataUrl) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-dark" style={{ width: '1.25rem', height: '1.25rem' }} />
      </div>
    )
  }
  return (
    <img
      src={dataUrl}
      alt="Invite QR code"
      width={size}
      height={size}
      style={{ borderRadius: 8, background: '#fff', display: 'block' }}
    />
  )
}
