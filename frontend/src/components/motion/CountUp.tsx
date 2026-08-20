import { useEffect, useRef, useState } from 'react'
import anime from 'animejs'
import { fmt, fmtBalance, toMoney } from '../../utils/format'

type Props = {
  value: number | string | null | undefined
  /** `balance` uses Deficit/Surplus style; `money` is always PKR abs. */
  variant?: 'balance' | 'money'
  className?: string
  durationMs?: number
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Short count-up for dashboard totals (~0.6s). Skips when reduced motion.
 */
export function CountUp({
  value,
  variant = 'balance',
  className,
  durationMs = 620,
}: Props) {
  const target = toMoney(value)
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0))
  const displayRef = useRef(prefersReducedMotion() ? target : 0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      displayRef.current = target
      setDisplay(target)
      return
    }
    const state = { n: displayRef.current }
    const anim = anime({
      targets: state,
      n: target,
      duration: durationMs,
      easing: 'easeOutExpo',
      round: 1,
      update: () => {
        displayRef.current = state.n
        setDisplay(state.n)
      },
    })
    return () => {
      anim.pause()
    }
  }, [target, durationMs])

  const text = variant === 'money' ? fmt(display) : fmtBalance(display)
  return <span className={className}>{text}</span>
}
