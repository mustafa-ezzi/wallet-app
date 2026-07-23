import { useEffect, useRef } from 'react'
import anime from 'animejs'

interface Props {
  /** Gradient colors of the incoming theme */
  colorFrom: string
  colorTo: string
  /** Screen coordinates the reveal expands from (tapped swatch) */
  x: number
  y: number
}

/**
 * Professional theme transition: a circle of the new theme color expands
 * from the tapped swatch, covers the screen, then fades to reveal the
 * re-themed UI. No bouncing, no cartoon waves.
 */
export default function ThemeRevealOverlay({ colorFrom, colorTo, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const vw = window.innerWidth
    const vh = window.innerHeight
    const radius = Math.ceil(Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y))) + 24

    anime.set(el, {
      clipPath: `circle(0px at ${x}px ${y}px)`,
      opacity: 1,
    })

    const tl = anime.timeline({ autoplay: true })

    tl.add({
      targets: el,
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${radius}px at ${x}px ${y}px)`,
      ],
      duration: 480,
      easing: 'easeInOutQuart',
    })
      .add({
        targets: el,
        opacity: 0,
        duration: 340,
        easing: 'easeOutQuad',
      }, '+=90')

    return () => {
      tl.pause()
      anime.remove(el)
    }
  }, [colorFrom, colorTo, x, y])

  return (
    <div
      ref={ref}
      className="theme-reveal"
      aria-hidden
      style={{ background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)` }}
    />
  )
}
