import { useEffect, useRef } from 'react'
import anime from 'animejs'

interface Props {
  color: string
}

/** Full-screen liquid wave wipe used when switching themes. */
export default function ThemeWaveOverlay({ color }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const layers = root.querySelectorAll<SVGElement>('.theme-wave-layer')
    const veil = root.querySelector<HTMLElement>('.theme-wave-veil')
    const bloom = root.querySelector<HTMLElement>('.theme-wave-bloom')

    anime.set(root, { opacity: 1 })
    anime.set(layers, { translateY: '110%' })
    anime.set(veil, { opacity: 0 })
    anime.set(bloom, { scale: 0.4, opacity: 0 })

    const tl = anime.timeline({ autoplay: true })

    tl.add({
      targets: veil,
      opacity: [0, 0.28],
      duration: 260,
      easing: 'easeOutQuad',
    })
      .add({
        targets: bloom,
        scale: [0.35, 1.35],
        opacity: [0, 0.55, 0.2],
        duration: 900,
        easing: 'easeOutExpo',
      }, 0)
      .add({
        targets: layers[2],
        translateY: ['115%', '-2%'],
        duration: 760,
        easing: 'easeOutQuart',
      }, 50)
      .add({
        targets: layers[1],
        translateY: ['118%', '-6%'],
        duration: 820,
        easing: 'easeOutCubic',
      }, 110)
      .add({
        targets: layers[0],
        translateY: ['122%', '-10%'],
        duration: 880,
        easing: 'easeOutQuad',
      }, 170)
      .add({
        targets: layers,
        translateY: '-125%',
        duration: 700,
        delay: anime.stagger(70, { from: 'last' }),
        easing: 'easeInCubic',
      }, '+=100')
      .add({
        targets: [veil, bloom],
        opacity: 0,
        duration: 360,
        easing: 'easeOutQuad',
      }, '-=480')
      .add({
        targets: root,
        opacity: 0,
        duration: 200,
        easing: 'linear',
      }, '-=120')

    return () => {
      tl.pause()
      anime.remove([root, veil, bloom, ...Array.from(layers)])
    }
  }, [color])

  return (
    <div ref={rootRef} className="theme-wave-root" aria-hidden>
      <div className="theme-wave-veil" />
      <div className="theme-wave-bloom" style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }} />
      {[0, 1, 2].map(i => (
        <svg
          key={i}
          className={`theme-wave-layer theme-wave-layer-${i + 1}`}
          viewBox="0 0 1440 420"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`twg-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={i === 0 ? 0.55 : i === 1 ? 0.78 : 1} />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#twg-${i})`}
            d={
              i === 0
                ? 'M0,160L48,170C96,180,192,200,288,190C384,180,480,140,576,130C672,120,768,140,864,165C960,190,1056,220,1152,210C1248,200,1344,150,1392,125L1440,100L1440,420L0,420Z'
                : i === 1
                  ? 'M0,200L60,185C120,170,240,140,360,150C480,160,600,210,720,220C840,230,960,190,1080,170C1200,150,1320,150,1380,150L1440,150L1440,420L0,420Z'
                  : 'M0,240L80,230C160,220,320,200,480,205C640,210,800,250,960,255C1120,260,1280,230,1360,215L1440,200L1440,420L0,420Z'
            }
          />
          <rect x="0" y="280" width="1440" height="160" fill={color} opacity={i === 0 ? 0.55 : i === 1 ? 0.78 : 1} />
        </svg>
      ))}
    </div>
  )
}
