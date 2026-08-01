# CashTrail Ops (Phase 0–1)

Staff-only console: hosted users + dashboard metrics. **Never** shows wallets, balances, or transactions.

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
| POST | `/api/ops/users/refresh-inactivity/` | Recompute inactivity flags |
| GET/POST | `/api/ops/campaigns/` | List / create draft |
| GET | `/api/ops/campaigns/estimate/?audience=` | Audience size |
| POST | `/api/ops/campaigns/:id/send/` | `{confirm:true}` or `{dry_run:true}` |
| POST | `/api/ops/campaigns/:id/cancel/` | Cancel draft/scheduled |

All require JWT + `is_staff=True`.
