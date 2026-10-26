import { QueryClient } from '@tanstack/react-query'

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        const status = httpStatus(error)
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
    },
  },
})

/** Pulls DRF's `detail` message out of an axios error, with a fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail ? detail : fallback
}
