import { useEffect, useRef } from 'react'
import anime from 'animejs'

interface Props {
  /** Gradient colors of the incoming theme */
  colorFrom: string
  colorTo: string
  /** Kept for API parity with ThemeProvider (pixel wipe is full-screen). */
  x: number
  y: number
}

const COLS = 12
const ROWS = 8

/**
 * Theme switch: pixel dissolve inspired by React Bits Pixel Transition,
 * implemented with animejs (already in the app — no GSAP).
 */
export default function ThemeRevealOverlay({ colorFrom, colorTo }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    grid.innerHTML = ''
    const pixels: HTMLDivElement[] = []
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const pixel = document.createElement('div')
        pixel.className = 'theme-pixel'
        pixel.style.background = `linear-gradient(135deg, ${colorFrom}, ${colorTo})`
        pixel.style.gridColumn = String(col + 1)
        pixel.style.gridRow = String(row + 1)
        grid.appendChild(pixel)
        pixels.push(pixel)
      }
    }

    anime.set(pixels, { opacity: 0, scale: 0.4 })

    const tl = anime.timeline({ autoplay: true })
    tl.add({
      targets: pixels,
      opacity: [0, 1],
      scale: [0.4, 1],
      duration: 220,
      delay: anime.stagger(4, { from: 'center', grid: [COLS, ROWS] }),
      easing: 'easeOutQuad',
    }).add({
      targets: pixels,
      opacity: 0,
      scale: 0.9,
      duration: 200,
      delay: anime.stagger(3.5, { from: 'center', grid: [COLS, ROWS] }),
      easing: 'easeInQuad',
    }, '+=90')

    return () => {
      tl.pause()
      anime.remove(pixels)
      grid.innerHTML = ''
    }
  }, [colorFrom, colorTo])

  return (
    <div className="theme-reveal theme-reveal-pixel" aria-hidden>
      <div
        ref={gridRef}
        className="theme-pixel-grid"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      />
    </div>
  )
}
