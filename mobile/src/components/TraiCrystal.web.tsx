import { View } from 'react-native'
import CrystalizedBall from './CrystalizedBall'

/** Browser preview of the listening ball. Android uses TraiCrystal.tsx instead. */
export function TraiCrystal({ primary }: { primary: string; highlight: string }) {
  return (
    <View style={{ width: 148, height: 148 }}>
      <CrystalizedBall
        preset="plasma"
        color={primary}
        theme="dark"
        size={0.62}
        crackle={0.7}
        fill={0.45}
        flares={0.35}
        glow={0.45}
        interactive
        hoverStrength={0.7}
      />
    </View>
  )
}
