import * as Popover from '@radix-ui/react-popover'
import { format, isAfter, parseISO, startOfDay } from 'date-fns'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatRange, previousPeriod, RANGE_PRESETS, rangeForPreset, type DateRange } from '../../lib/dateRange'
import { Button } from './Button'
import { Input, Label } from './Input'
import { Switch } from './Switch'

const ISO = 'yyyy-MM-dd'

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(format(value.from, ISO))
  const [to, setTo] = useState(format(value.to, ISO))

  useEffect(() => {
    if (open) {
      setFrom(format(value.from, ISO))
      setTo(format(value.to, ISO))
    }
  }, [open, value.from, value.to])

  const today = format(new Date(), ISO)
  const customValid = Boolean(from && to) && !isAfter(parseISO(from), parseISO(to)) && to <= today
  const prev = previousPeriod(value)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="secondary" className={cn('gap-2 px-3', className)} aria-label={`Date range: ${formatRange(value)}`}>
          <CalendarDays className="text-muted" />
          <span className="max-sm:hidden">{formatRange(value)}</span>
          <ChevronDown className="text-subtle max-sm:hidden" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[300px] rounded-2xl border border-border bg-surface p-3 shadow-pop data-[state=open]:animate-fade-in"
        >
          <div className="grid gap-0.5" role="group" aria-label="Quick ranges">
            {RANGE_PRESETS.map((preset) => {
              const active = value.preset === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    onChange(rangeForPreset(preset.value, value.compare))
                    setOpen(false)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2',
                    active ? 'font-semibold text-primary' : 'text-fg',
                  )}
                >
                  {preset.label}
                  {active ? <Check className="size-4" aria-hidden /> : null}
                </button>
              )
            })}
          </div>

          <div className="my-3 h-px bg-border" />

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="range-from">From</Label>
              <Input id="range-from" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="range-to">To</Label>
              <Input id="range-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="mt-2 w-full"
            disabled={!customValid}
            onClick={() => {
              onChange({
                preset: 'custom',
                from: startOfDay(parseISO(from)),
                to: startOfDay(parseISO(to)),
                compare: value.compare,
              })
              setOpen(false)
            }}
          >
            Apply custom range
          </Button>

          <div className="my-3 h-px bg-border" />

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-fg">Compare to previous period</p>
              <p className="text-xs text-subtle">
                {format(prev.from, 'd MMM')} – {format(prev.to, 'd MMM yyyy')}
              </p>
            </div>
            <Switch
              label="Compare to previous period"
              checked={value.compare}
              onCheckedChange={(compare) => onChange({ ...value, compare })}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
