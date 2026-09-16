import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { asList, categoriesApi, type UserCategory } from '../api/client'
import { useAuth } from './AuthContext'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryMeta, type CategoryMeta } from '../constants/categories'

type CategoriesValue = {
  custom: UserCategory[]
  expenseCategories: CategoryMeta[]
  incomeCategories: CategoryMeta[]
  loading: boolean
  refresh: () => Promise<void>
  create: (kind: 'expense' | 'income', name: string) => Promise<void>
  remove: (id: number) => Promise<void>
}

const CategoriesContext = createContext<CategoriesValue | null>(null)

function merge(builtins: CategoryMeta[], custom: UserCategory[], kind: 'expense' | 'income'): CategoryMeta[] {
  const used = new Set(builtins.map((b) => b.key.toLowerCase()))
  const extra = custom
    .filter((c) => c.kind === kind && !used.has(c.name.toLowerCase()))
    .map((c) => getCategoryMeta(c.name))
  return [...extra, ...builtins]
}

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [custom, setCustom] = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setCustom([])
      return
    }
    setLoading(true)
    try {
      const { data } = await categoriesApi.list()
      setCustom(asList<UserCategory>(data))
    } catch {
      /* keep previous */
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(async (kind: 'expense' | 'income', name: string) => {
    await categoriesApi.create({ kind, name })
    await refresh()
  }, [refresh])

  const remove = useCallback(async (id: number) => {
    await categoriesApi.remove(id)
    await refresh()
  }, [refresh])

  const value = useMemo<CategoriesValue>(() => ({
    custom,
    expenseCategories: merge(EXPENSE_CATEGORIES, custom, 'expense'),
    incomeCategories: merge(INCOME_CATEGORIES, custom, 'income'),
    loading,
    refresh,
    create,
    remove,
  }), [custom, loading, refresh, create, remove])

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>
}

export function useCategories(): CategoriesValue {
  const ctx = useContext(CategoriesContext)
  if (!ctx) {
    return {
      custom: [],
      expenseCategories: EXPENSE_CATEGORIES,
      incomeCategories: INCOME_CATEGORIES,
      loading: false,
      refresh: async () => undefined,
      create: async () => undefined,
      remove: async () => undefined,
    }
  }
  return ctx
}
