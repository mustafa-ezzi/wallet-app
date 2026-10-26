# WalletTrails Ops

Staff-only console: hosted users + dashboard metrics. **Never** shows wallets, balances, or transactions.

Redesign roadmap: [`docs/research/admin-panel-redesign-and-ecosystem.md`](../docs/research/admin-panel-redesign-and-ecosystem.md) (Phase 1 — design system + shell — is in place).

## UI stack

- Tailwind CSS v4 with light/dark tokens in `src/styles/index.css` (`data-theme` on `<html>`); old page classes live in `src/styles/legacy.css` until Phase 2 rebuilds those pages.
- Components in `src/components/ui` (Radix primitives, Lucide icons, Recharts, TanStack Table, sonner). Browse them at `/ui`.
- Shell in `src/layout` — grouped sidebar, top bar with date range + theme toggle, Ctrl/⌘ K command palette.
- Server state through TanStack Query hooks in `src/queries.ts`; forms use React Hook Form + Zod.

## Run locally

1. Backend (`d:\My-Wallet\backend`):

```bash
py -3 manage.py migrate
py -3 manage.py createsuperuser   # if needed
# Ensure your user has is_staff=True
py -3 manage.py runserver
```

2. Ops UI:

```bash
cd frontend-admin
npm install
npm run dev
```

Open http://127.0.0.1:5174 — sign in with a **staff** Django user.

Production: leave `VITE_API_URL` empty when using the Vite proxy locally. For a hosted Ops site, set `VITE_API_URL` to the API origin and add that Ops origin to Railway `OPS_FRONTEND_URL` / CORS.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/ops/me/` | Staff identity |
| GET | `/api/ops/dashboard/` | KPIs (counts only) |
| GET | `/api/ops/users/` | `q`, `platform`, `inactivity`, `suspended`, `push`, `page` |
| GET | `/api/ops/users/:id/` | Safe summary |
| POST | `/api/ops/users/:id/suspend/` | Sets `is_active=False` + audit |
| POST | `/api/ops/users/:id/unsuspend/` | Restores access + audit |
| POST | `/api/ops/users/:id/delete/` | Hard-delete user + linked data (`confirm_username` required) |
| POST | `/api/ops/users/refresh-inactivity/` | Recompute inactivity flags |
| GET/POST | `/api/ops/campaigns/` | List / create draft |
| GET | `/api/ops/campaigns/estimate/?audience=` | Audience size |
| POST | `/api/ops/campaigns/:id/send/` | `{confirm:true}` or `{dry_run:true}` |
| POST | `/api/ops/campaigns/:id/cancel/` | Cancel draft/scheduled |

All require JWT + `is_staff=True`.
