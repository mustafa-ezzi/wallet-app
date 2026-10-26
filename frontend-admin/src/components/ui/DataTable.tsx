import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'

export type ServerPagination = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  empty,
  onRowClick,
  getRowId,
  pagination,
  enableSorting = true,
  caption,
  className,
  mobileCard,
  columnVisibility,
}: {
  columns: ColumnDef<T, any>[]
  data: T[]
  loading?: boolean
  empty?: ReactNode
  onRowClick?: (row: T) => void
  getRowId?: (row: T, index: number) => string
  pagination?: ServerPagination
  /** Client-side sorting of the rows currently loaded. */
  enableSorting?: boolean
  caption?: string
  className?: string
  /** Below the md breakpoint, render each row as a card instead of a table row. */
  mobileCard?: (row: T) => ReactNode
  /** Column id → visible; columns not listed stay visible. */
  columnVisibility?: VisibilityState
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: columnVisibility ?? {} },
    onSortingChange: setSorting,
    enableSorting,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const columnCount = table.getVisibleLeafColumns().length
  const rows = table.getRowModel().rows
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1
  const firstRow = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 1
  const lastRow = pagination ? Math.min(pagination.total, pagination.page * pagination.pageSize) : data.length

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card', className)}>
      {mobileCard ? (
        <ul className="divide-y divide-border md:hidden">
          {loading && data.length === 0 ? (
            Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </li>
            ))
          ) : rows.length === 0 ? (
            <li>{empty ?? <EmptyState title="Nothing here yet" />}</li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className={cn(loading && 'opacity-60')}>
                {onRowClick ? (
                  <button
                    type="button"
                    onClick={() => onRowClick(row.original)}
                    className="block w-full cursor-pointer p-4 text-left hover:bg-brand/[0.04] focus-visible:bg-brand/[0.06] focus-visible:outline-none"
                  >
                    {mobileCard(row.original)}
                  </button>
                ) : (
                  <div className="p-4">{mobileCard(row.original)}</div>
                )}
              </li>
            ))
          )}
        </ul>
      ) : null}
      <div className={cn('overflow-x-auto', mobileCard && 'hidden md:block')}>
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-border bg-surface-2">
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const label = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className="px-4 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 uppercase hover:text-fg"
                        >
                          {label}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border last:border-0">
                  {Array.from({ length: columnCount }, (_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <Skeleton className={cn('h-4', j === 0 ? 'w-32' : 'w-16')} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>{empty ?? <EmptyState title="Nothing here yet" />}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter') onRowClick(row.original)
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'border-b border-border transition-colors last:border-0 hover:bg-brand/[0.04]',
                    onRowClick && 'cursor-pointer focus-visible:bg-brand/[0.06] focus-visible:outline-none',
                    loading && 'opacity-60',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle whitespace-nowrap text-fg">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[13px] text-muted">
          <span className="tabular">
            {firstRow}–{lastRow} of {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous page"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular">
              Page {pagination.page} / {totalPages}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next page"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
