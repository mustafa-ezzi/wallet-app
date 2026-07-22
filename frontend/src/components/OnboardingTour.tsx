import { useEffect, useLayoutEffect, useState, useCallback, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from 'animejs'

const TOUR_KEY = 'cashtrail_tour_v1_done'

export type TourStep = {
  id: string
  selector: string
  title: string
  body: string
  path?: string
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    selector: '[data-tour="brand"]',
    title: 'Welcome to CashTrail',
    body: 'A quick tour of where your money lives — accounts, income, bills, and reports.',
    path: '/',
  },
  {
    id: 'overview',
    selector: '[data-tour="nav-overview"]',
    title: 'Overview',
    body: 'Your home screen: total balance, this month’s money in and out, and a simple forecast.',
    path: '/',
  },
  {
    id: 'accounts',
    selector: '[data-tour="nav-accounts"]',
    title: 'Accounts',
    body: 'Bank and cash wallets. Add every place you keep money so balances stay accurate.',
    path: '/accounts',
  },
  {
    id: 'income',
    selector: '[data-tour="nav-income"]',
    title: 'Income',
    body: 'Where money comes from — salary, clients, deals. Not only “projects”: any income source.',
    path: '/income',
  },
  {
    id: 'bills',
    selector: '[data-tour="nav-bills"]',
    title: 'Bills',
    body: 'Fixed monthly costs, loans you pay, and money others still owe you.',
    path: '/expenses',
  },
  {
    id: 'reports',
    selector: '[data-tour="nav-reports"]',
    title: 'Reports',
    body: 'See expected vs actual for the month so you know if you are on track.',
    path: '/reports',
  },
  {
    id: 'fab',
    selector: '[data-tour="fab"]',
    title: 'Add money in or out',
    body: 'Tap + anytime to log income, an expense, or a transfer between accounts.',
    path: '/',
  },
]

function getRect(selector: string): DOMRect | null {
  const nodes = Array.from(document.querySelectorAll(selector))
  for (const el of nodes) {
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    if (rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none') {
      // Prefer elements that are actually on-screen
      if (rect.bottom > 0 && rect.top < window.innerHeight) return rect
    }
  }
  return nodes[0]?.getBoundingClientRect() ?? null
}

interface Props {
  forceOpen?: boolean
  onDone?: () => void
}

export default function OnboardingTour({ forceOpen, onDone }: Props) {
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [hole, setHole] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (forceOpen) {
      setActive(true)
      setStep(0)
      return
    }
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = window.setTimeout(() => setActive(true), 600)
      return () => window.clearTimeout(t)
    }
  }, [forceOpen])

  const current = STEPS[step]

  const updateHole = useCallback(() => {
    if (!current) return
    const rect = getRect(current.selector)
    if (!rect) {
      setHole(null)
      return
    }
    const pad = 10
    setHole({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    })
  }, [current])

  useLayoutEffect(() => {
    if (!active || !current) return
    if (current.path && window.location.pathname !== current.path) {
      navigate(current.path)
    }
    const t = window.setTimeout(updateHole, 280)
    window.addEventListener('resize', updateHole)
    window.addEventListener('scroll', updateHole, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', updateHole)
      window.removeEventListener('scroll', updateHole, true)
    }
  }, [active, current, navigate, updateHole, step])

  useEffect(() => {
    if (!active) return
    anime({
      targets: '.tour-card',
      opacity: [0, 1],
      translateY: [18, 0],
      duration: 420,
      easing: 'easeOutCubic',
    })
    anime({
      targets: '.tour-spotlight-hole',
      scale: [0.92, 1],
      opacity: [0.5, 1],
      duration: 480,
      easing: 'easeOutElastic(1, .7)',
    })
  }, [active, step])

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1')
    setActive(false)
    onDone?.()
  }

  const next = () => {
    if (step >= STEPS.length - 1) finish()
    else setStep(s => s + 1)
  }

  const back = () => setStep(s => Math.max(0, s - 1))

  if (!active || !current) return null

  const cardStyle: CSSProperties = hole
    ? {
        position: 'fixed',
        zIndex: 10002,
        left: 16,
        right: 16,
        maxWidth: 360,
        margin: '0 auto',
        ...(hole.top > window.innerHeight * 0.45
          ? { top: Math.max(16, hole.top - 170) }
          : { top: Math.min(window.innerHeight - 200, hole.top + hole.height + 16) }),
      }
    : {
        position: 'fixed',
        zIndex: 10002,
        left: 16,
        right: 16,
        bottom: 110,
        maxWidth: 360,
        margin: '0 auto',
      }

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="App tour">
      <div className="tour-dim" />
      {hole && (
        <div
          className="tour-spotlight-hole"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
        />
      )}

      <div className="tour-card glass" style={cardStyle}>
        <div className="tour-progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`tour-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
        <div className="tour-actions">
          <button type="button" className="btn-glass" onClick={finish}>Skip</button>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            {step > 0 && (
              <button type="button" className="btn-glass" onClick={back}>Back</button>
            )}
            <button type="button" className="btn-primary" onClick={next}>
              {step >= STEPS.length - 1 ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function resetTour() {
  localStorage.removeItem(TOUR_KEY)
}
