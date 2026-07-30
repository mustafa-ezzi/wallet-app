export type Account = {
  id: number
  name: string
  type: 'bank' | 'cash'
  opening_balance: number | string
  current_balance: number | string
  created_at?: string
}

export type Transaction = {
  id: number
  type: 'income' | 'expense'
  amount: number | string
  date: string
  account: number
  account_name?: string | null
  category: string
  notes: string
  client_mutation_id?: string | null
  linked_payable?: number | null
  linked_receivable?: number | null
  linked_project?: number | null
}

export type Dashboard = {
  total_balance: number | string
  accounts: { id: number; name: string; type: string; balance: number | string }[]
  month_income: number | string
  month_expense: number | string
  month_net: number | string
  recent_transactions: Transaction[]
}

export type RecurringExpense = {
  id: number
  name: string
  amount: number | string
  frequency: 'monthly' | 'one_time'
  due_day: number
  account: number
  account_name?: string | null
  active: boolean
  paid_this_month: boolean
}

export type Payable = {
  id: number
  name: string
  total_amount: number | string
  monthly_amount: number | string
  total_installments: number
  installments_paid: number
  remaining_amount: number | string
  due_day: number
  account: number
  account_name?: string | null
  status: string
  paid_this_month: boolean
}

export type Receivable = {
  id: number
  linked_project: number
  project_name?: string | null
  total_amount: number | string
  monthly_amount: number | string
  total_installments: number
  installments_received: number
  remaining_amount: number | string
  start_date: string
  status: string
  received_this_month: boolean
}
