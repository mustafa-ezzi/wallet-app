import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Stagger index (0-based). */
  index?: number
  className?: string
  style?: CSSProperties
  /** Delay between items in ms. */
  stepMs?: number
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Soft fade + slight rise on mount (CashTrail list / card reveal).
 */
export function Reveal({
  children,
  index = 0,
  className = '',
  style,
  stepMs = 45,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [on, setOn] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOn(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true)
          io.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`ct-reveal ${on ? 'ct-reveal-on' : ''} ${className}`.trim()}
      style={{
        ...style,
        transitionDelay: on ? `${Math.min(index, 12) * stepMs}ms` : undefined,
      }}
    >
      {children}
    </div>
  )
}
