import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import Svg, { Ellipse, Path } from 'react-native-svg'

type Rgb = [number, number, number]
type Quad = { d: string; fill: string }

const WIDTH = 220
const HEIGHT = 156

/** A translucent ribbon tied in a slow trefoil, coloured with the current theme. */
export function TraiKnot({ primary, highlight }: { primary: string; highlight: string }) {
  const [quads, setQuads] = useState<Quad[]>(() => ribbonQuads(0.8, parseColor(primary), parseColor(highlight)))

  useEffect(() => {
    let frame = 0
    let alive = true
    let reduced = false
    let ready = false
    const started = Date.now()
    let last = 0
    const ink = parseColor(primary)
    const sheen = parseColor(highlight)

    const draw = (now: number) => {
      if (!alive) return
      if (ready && !reduced && now - last > 32) {
        last = now
        setQuads(ribbonQuads((Date.now() - started) / 1000, ink, sheen))
      }
      frame = requestAnimationFrame(draw)
    }

    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (!alive) return
      reduced = enabled
      ready = true
      if (enabled) setQuads(ribbonQuads(0.8, ink, sheen))
    })
    frame = requestAnimationFrame(draw)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [primary, highlight])

  return (
    <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <Ellipse cx={WIDTH / 2} cy={HEIGHT / 2} rx={78} ry={40} fill={primary} opacity={0.16} />
      {quads.map((quad, index) => (
        <Path key={index} d={quad.d} fill={quad.fill} />
      ))}
    </Svg>
  )
}

function ribbonQuads(seconds: number, primary: Rgb, highlight: Rgb): Quad[] {
  const samples = 56
  const angle = seconds * 0.32
  const flow = seconds * 0.9
  const tilt = 32 * Math.PI / 180
  const scale = Math.min(WIDTH, HEIGHT) * 0.92
  const points: { x: number; y: number; z: number; t: number }[] = []
  for (let index = 0; index <= samples; index += 1) {
    const t = (index / samples) * Math.PI * 2
    const x = Math.sin(t) + 2 * Math.sin(2 * t)
    const y = Math.cos(t) - 2 * Math.cos(2 * t)
    const z = -Math.sin(3 * t)
    const cosY = Math.cos(angle)
    const sinY = Math.sin(angle)
    const x1 = x * cosY + z * sinY
    const z1 = -x * sinY + z * cosY
    const cosX = Math.cos(tilt)
    const sinX = Math.sin(tilt)
    const y2 = y * cosX - z1 * sinX
    const z2 = y * sinX + z1 * cosX
    const depth = 4.4 - z2 * 0.55
    points.push({
      x: WIDTH / 2 + (x1 / depth) * scale,
      y: HEIGHT / 2 + (y2 / depth) * scale,
      z: z2,
      t,
    })
  }

  const quads: (Quad & { z: number })[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]
    const b = points[index + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const twist = Math.cos(4 * a.t + flow)
    const half = 5 + 11 * Math.abs(twist)
    const face = Math.abs(twist)
    const depth = Math.max(0, Math.min(1, (a.z + 1.2) / 2.4))
    const color = mix(primary, highlight, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a.t * 2 + flow)))
    const alpha = 0.28 + 0.5 * depth * (0.55 + 0.45 * face)
    const ax = a.x + nx * half
    const ay = a.y + ny * half
    const bx = b.x + nx * half
    const by = b.y + ny * half
    const cx = b.x - nx * half
    const cy = b.y - ny * half
    const ox = a.x - nx * half
    const oy = a.y - ny * half
    quads.push({
      z: (a.z + b.z) / 2,
      d: `M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} L ${ox} ${oy} Z`,
      fill: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`,
    })
  }
  quads.sort((left, right) => left.z - right.z)
  return quads
}

function parseColor(input: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(input.trim())
  if (!hex) return [5, 150, 105]
  const n = Number.parseInt(hex[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.max(0, Math.min(1, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ]
}
