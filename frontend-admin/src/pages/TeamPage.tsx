import { CircleAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { OpsRole, TeamMember } from '../api'
import { useCan } from '../AuthContext'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  toast,
} from '../components/ui'
import { apiErrorMessage } from '../lib/queryClient'
import { useRevokeTeamMember, useSaveTeamMember, useSetTeamRole, useTeam } from '../queries'

const ROLES: { value: OpsRole; label: string; hint: string }[] = [
  { value: 'owner', label: 'Owner', hint: 'Everything, including team and integrations' },
  { value: 'admin', label: 'Admin', hint: 'Everything except team and roles' },
  { value: 'support', label: 'Support', hint: 'Read users, handle tickets, read the audit log' },
  { value: 'marketing', label: 'Marketing', hint: 'Promos, notifications, and read-only overview' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only dashboards' },
]

function roleLabel(role: OpsRole) {
  return ROLES.find((item) => item.value === role)?.label ?? role
}

export function TeamPage() {
  const team = useTeam()
  const save = useSaveTeamMember()
  const setRole = useSetTeamRole()
  const revoke = useRevokeTeamMember()
  const canWrite = useCan('team.write')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRoleValue] = useState<OpsRole>('support')
  const [pendingRevoke, setPendingRevoke] = useState<TeamMember | null>(null)

  function invite() {
    save.mutate(
      { username: username.trim(), email: email.trim(), password, role },
      {
        onSuccess: (member) => {
          toast.success(`@${member.username} is ${roleLabel(member.role)}.`)
          setUsername('')
          setEmail('')
          setPassword('')
        },
        onError: (err) => toast.error(apiErrorMessage(err, 'Could not save that staff user.')),
      },
    )
  }

  return (
    <>
      <PageHeader
        title="Team & roles"
        description="Staff who can open Ops. A role is enforced by the API, not only by this menu."
      />

      {canWrite ? (
        <Card className="mb-4 p-5">
          <h2 className="text-base font-semibold text-fg">Add or update a staff user</h2>
          <p className="mt-1 text-[13px] text-muted">
            An existing username is given this role. A new username needs a password of at least 8 characters.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Password" hint="Required only for a new user">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRoleValue(e.target.value as OpsRole)} aria-label="Role">
                {ROLES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="mt-3 text-xs text-subtle">{ROLES.find((item) => item.value === role)?.hint}</p>
          <div className="mt-4">
            <Button variant="primary" disabled={!username.trim()} loading={save.isPending} onClick={invite}>
              Save staff user
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        {team.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : team.isError ? (
          <EmptyState icon={CircleAlert} title="Couldn't load the team" action={<Button onClick={() => void team.refetch()}>Try again</Button>} />
        ) : (team.data ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No staff yet" description="Add a staff user to give someone access to Ops." />
        ) : (
          <ul className="divide-y divide-border">
            {(team.data ?? []).map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg">@{member.username}</div>
                  <div className="text-xs text-muted">{member.email || 'No email'}</div>
                </div>
                {canWrite ? (
                  <Select
                    aria-label={`Role for ${member.username}`}
                    className="w-40"
                    value={member.role}
                    disabled={setRole.isPending}
                    onChange={(e) =>
                      setRole.mutate(
                        { userId: member.id, role: e.target.value as OpsRole },
                        {
                          onSuccess: () => toast.success(`@${member.username} is now ${roleLabel(e.target.value as OpsRole)}.`),
                          onError: (err) => toast.error(apiErrorMessage(err, 'Could not change that role.')),
                        },
                      )
                    }
                  >
                    {ROLES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge>{roleLabel(member.role)}</Badge>
                )}
                {member.is_superuser ? <Badge tone="info">Superuser</Badge> : null}
                {canWrite ? (
                  <Button variant="danger-soft" onClick={() => setPendingRevoke(member)}>
                    Remove access
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null)
        }}
        title={pendingRevoke ? `Remove Ops access for @${pendingRevoke.username}?` : 'Remove access?'}
        description="Their WalletTrails account stays. They just can't open this panel."
        confirmLabel="Remove access"
        tone="danger"
        loading={revoke.isPending}
        onConfirm={() => {
          if (!pendingRevoke) return
          revoke.mutate(pendingRevoke.id, {
            onSuccess: () => {
              toast.success(`@${pendingRevoke.username} no longer has Ops access.`)
              setPendingRevoke(null)
            },
            onError: (err) => toast.error(apiErrorMessage(err, 'Could not remove access.')),
          })
        }}
      />
    </>
  )
}
