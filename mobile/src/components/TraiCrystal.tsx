import { TraiKnot } from './TraiKnot'

/** Android uses the ribbon. The crystal ball needs a browser canvas. */
export function TraiCrystal({ primary, highlight }: { primary: string; highlight: string }) {
  return <TraiKnot primary={primary} highlight={highlight} />
}
