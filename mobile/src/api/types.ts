export type Account = {
  id: number
  name: string
  type: 'bank' | 'cash' | 'person'
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
  original_amount?: number | string | null
  original_currency?: string | null
  fx_rate?: number | string | null
  fx_source?: string | null
  people_pair_id?: string | null
  people_action?: string | null
}

export type PeopleHistory = {
  person: Account
  year: number
  month: number
  opening_balance: number
  inflow: number
  outflow: number
  closing_balance: number
  pending_net: number
  transactions: Transaction[]
}

export type PeopleActionKind = 'lend' | 'borrow' | 'pay' | 'receive'

export type PeopleInvitation = {
  id: number
  from_user: number
  to_user: number
  from_user_email?: string
  from_user_name?: string
  to_user_email?: string
  to_user_name?: string
  display_name: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  invited_via: string
  query_snapshot?: string
  created_at?: string
  responded_at?: string | null
}

export type PeopleLink = {
  id: number
  status: 'active' | 'unlinked'
  created_at?: string
  user_a: number
  user_b: number
  person_a: number
  person_b: number
  my_person?: Account | null
  other_user?: {
    id: number
    email?: string
    username?: string
    name?: string
  } | null
}

export type PeopleProposal = {
  id: number
  link: number
  proposer: number
  counterparty: number
  action: PeopleActionKind
  amount: number | string
  date: string
  notes: string
  proposer_wallet: number
  counterparty_wallet?: number | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  people_pair_id: string
  client_mutation_id?: string
  created_at?: string
  responded_at?: string | null
}

export type Dashboard = {
  total_balance: number | string
  accounts: { id: number; name: string; type: string; balance: number | string }[]
  people?: { id: number; name: string; type: string; balance: number | string }[]
  month_income: number | string
  month_expense: number | string
  month_net: number | string
  recent_transactions: Transaction[]
}

export type TravelModeState = {
  enabled: boolean
  travel_currency: string
  rate: number | string | null
  rate_as_of?: string | null
  rate_source?: string
  start_date?: string | null
  end_date?: string | null
  updated_at?: string
  created_at?: string
}

export type FxQuote = {
  base: string
  quote: string
  rate: string
  as_of: string
  source: string
  stale: boolean
  warning?: string
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

export type Project = {
  id: number
  name: string
  income_type: 'recurring_monthly' | 'contract_monthly' | 'one_time' | 'one_time_installments'
  amount: number | string
  installment_amount?: number | string | null
  advance_amount?: number | string | null
  remaining_amount?: number | string
  months_to_complete?: number | null
  installments_received?: number | null
  received_this_month?: boolean
  status: 'active' | 'paused' | 'completed' | 'stuck' | string
  start_date: string
  default_account?: number | null
  default_account_name?: string | null
  notes?: string
}

export type ForecastItem = {
  label: string
  amount: number | string
  type: string
  due_day?: number | null
}

export type Forecast = {
  year: number
  month: number
  forecast_income: ForecastItem[]
  forecast_outgoing: ForecastItem[]
  total_expected_income: number | string
  total_expected_outgoing: number | string
  net_forecast: number | string
  actual_income: number | string
  actual_expense: number | string
  actual_net: number | string
}

export type Household = {
  id: number
  name: string
  currency: string
  my_role: string | null
  member_count: number
  ledger_count: number
}

export type HouseholdLedger = {
  id: number
  name: string
  kind: string
  status: string
  total_spent: number | string
  month_spent?: number | string
  pot_contributed?: number | string
  pot_spent?: number | string
  pot_balance?: number | string
  closed_total_expense?: number | string | null
  closed_at?: string | null
  start_date?: string
  end_date?: string | null
}

export type HouseholdExpense = {
  id: number
  amount: number | string
  date: string
  category: string
  notes: string
  pot_amount: number | string
  personal_amount?: number | string
  paid_by_name: string
  created_by: number
  account_name?: string | null
}

export type HouseholdInvite = {
  code: string
  expires_at?: string
  join_path?: string
  is_valid?: boolean
}

export type HouseholdMember = {
  id: number
  user: number | null
  display_name: string
  email: string
  role: string
  status: string
}

export type LedgerSummary = {
  total_spent: number | string
  expense_count: number
  by_member: { name: string; amount: number | string }[]
  by_category: { name: string; amount: number | string }[]
}

export type SettlementRow = {
  from_name?: string
  to_name?: string
  from_user?: number
  to_user?: number
  amount: number | string
  settled?: boolean
}
