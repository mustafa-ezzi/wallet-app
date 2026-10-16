'use dom'

import CrystalizedBall from './CrystalizedBall'

type DomBox = {
  style?: { width?: number; height?: number; backgroundColor?: string }
  scrollEnabled?: boolean
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only'
}

/** The listening ball, running in a real browser canvas on Android. */
export default function TraiCrystalDom({ color }: { color: string; dom?: DomBox }) {
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'transparent' }}>
      <style>{'html,body{margin:0;background:transparent}'}</style>
      <CrystalizedBall
        preset="plasma"
        color={color}
        theme="dark"
        size={0.62}
        crackle={0.7}
        fill={0.45}
        flares={0.35}
        glow={0.45}
        interactive
        hoverStrength={0.7}
      />
    </div>
  )
}
