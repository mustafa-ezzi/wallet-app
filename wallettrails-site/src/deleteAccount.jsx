import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './privacy.css'
import './brand.css'

const Logo = () => (
  <a className="logo logo--inverse" href="/">
    <img src="/media/wallettrail-logo.png" alt="WalletTrails" />
    <span>
      Wallet<span>Trails</span>
    </span>
  </a>
)

function DeleteAccountPage() {
  useEffect(() => {
    document.title = 'Delete account — WalletTrails'
  }, [])

  return (
    <>
      <header className="privacy-header">
        <div className="privacy-shell">
          <Logo />
          <a href="/" className="privacy-back">
            ← Back to WalletTrails
          </a>
        </div>
      </header>
      <main className="privacy-main">
        <div className="privacy-shell">
          <div className="privacy-hero">
            <span>ACCOUNT</span>
            <h1>
              Delete your
              <br />
              <em>WalletTrails account</em>
            </h1>
            <p>You can permanently delete your account and associated data from the app. This action cannot be undone.</p>
            <small>Last updated: 10 October 2026</small>
          </div>
          <article className="policy-copy" style={{ maxWidth: 720 }}>
            <section>
              <h2>In the Android app</h2>
              <ol>
                <li>Sign in to the account you want to remove.</li>
                <li>Open <strong>Settings</strong> (bottom navigation).</li>
                <li>Scroll to <strong>Delete my account</strong>.</li>
                <li>Type your username to confirm, then tap delete.</li>
              </ol>
            </section>
            <section>
              <h2>On the website</h2>
              <ol>
                <li>Sign in at your WalletTrails web app URL.</li>
                <li>Open <strong>Settings</strong>.</li>
                <li>Choose <strong>Delete my account</strong>, confirm with your username, and submit.</li>
              </ol>
            </section>
            <section>
              <h2>What happens next</h2>
              <p>
                We delete your account and personal financial records from our servers as part of the deletion flow. Some
                information may be retained for a limited time where required for security, fraud prevention, or legal
                obligations, as described in our{' '}
                <a href="/privacy.html">privacy policy</a>.
              </p>
            </section>
            <section>
              <h2>Need help?</h2>
              <p>
                If you cannot sign in or the in-app delete option fails, contact us through the in-app Help &amp; Support
                channel with the email on your account and we will verify and process your request.
              </p>
            </section>
          </article>
        </div>
      </main>
      <footer className="privacy-footer">
        <div className="privacy-shell">
          <Logo />
          <span>© 2026 WalletTrails. Follow every rupee.</span>
          <a href="/privacy.html">Privacy</a>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DeleteAccountPage />
  </StrictMode>,
)
