import { format } from 'date-fns'
import { BatteryFull, Signal, Wifi } from 'lucide-react'
import logo from '../assets/wallettrail-logo.png'

/** Android-style lock screen with the notification as users will roughly see it. */
export function PushPreview({ title, body, when = 'now' }: { title: string; body: string; when?: string }) {
  const now = new Date()
  const clock = format(now, 'H:mm')
  return (
    <figure className="mx-auto w-full max-w-[300px]" aria-label="Notification preview">
      <div className="rounded-[2.2rem] border-[6px] border-[#1d2622] bg-[#1d2622] shadow-pop">
        <div className="relative overflow-hidden rounded-[1.8rem] bg-[linear-gradient(160deg,#0f3d2e_0%,#0b1f18_55%,#132a3a_100%)] px-3 pt-2 pb-10 text-white">
          <div className="flex items-center justify-between px-2 text-[11px] font-semibold text-white/85">
            <span>{clock}</span>
            <span className="flex items-center gap-1" aria-hidden>
              <Signal className="size-3" />
              <Wifi className="size-3" />
              <BatteryFull className="size-3.5" />
            </span>
          </div>
          <div className="mt-6 mb-7 text-center">
            <div className="font-display text-5xl font-semibold tracking-tight text-white/95">{clock}</div>
            <div className="mt-1 text-xs text-white/70">{format(now, 'EEEE, d MMMM')}</div>
          </div>
          <div className="rounded-2xl bg-white/92 p-3 text-[#10201a] shadow-lg backdrop-blur">
            <div className="flex items-center gap-1.5 text-[11px] text-[#4a5d54]">
              <img src={logo} alt="" className="size-4 rounded" />
              <span className="font-semibold">WalletTrails</span>
              <span>· {when}</span>
            </div>
            <div className="mt-1.5 text-[13px] leading-snug font-semibold break-words">{title || 'Notification title'}</div>
            <div className="mt-0.5 line-clamp-4 text-[12.5px] leading-snug break-words text-[#33463d]">
              {body || 'Your message shows here.'}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-subtle">Approximate preview — devices may trim long text.</figcaption>
    </figure>
  )
}
