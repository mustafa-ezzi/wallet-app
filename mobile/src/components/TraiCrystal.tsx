import TraiCrystalDom from './TraiCrystalDom'

/** Same crystal ball as the browser preview. The ribbon stays unused on Android. */
export function TraiCrystal({ primary }: { primary: string; highlight: string }) {
  return (
    <TraiCrystalDom
      color={primary}
      dom={{
        style: { width: 148, height: 148, backgroundColor: 'transparent' },
        scrollEnabled: false,
        pointerEvents: 'none',
      }}
    />
  )
}
