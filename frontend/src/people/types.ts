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
  existing_person?: number | null
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
  my_person?: { id: number; name?: string; type?: string } | null
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
