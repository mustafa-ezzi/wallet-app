import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'

/** Search box that commits on Enter (or clear), keeping typing local until then. */
export function SearchInput({
  value,
  onSearch,
  placeholder = 'Search…',
  label = 'Search',
  className,
}: {
  value: string
  onSearch: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(draft.trim())
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-9.5 w-full rounded-[10px] border border-border-strong bg-surface pr-9 pl-9 text-sm text-fg placeholder:text-subtle',
          'outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 [&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            onSearch('')
          }}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </form>
  )
}
