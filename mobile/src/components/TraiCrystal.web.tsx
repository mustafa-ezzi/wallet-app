import { View } from 'react-native'
import CrystalizedBall from './CrystalizedBall'

/** Browser preview of the listening ball. Android uses TraiCrystal.tsx instead. */
export function TraiCrystal({ primary }: { primary: string; highlight: string }) {
  return (
    <View style={{ width: 200, height: 200 }}>
      <CrystalizedBall
        preset="plasma"
        color={primary}
        theme="dark"
        size={0.85}
        crackle={0.85}
        fill={0.5}
        interactive
        hoverStrength={0.7}
      />
    </View>
  )
}
