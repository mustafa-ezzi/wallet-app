# CashTrail

Follow every rupee. Personal finance management for freelancers and small businesses — accounts, projects, installments, bills, and monthly forecasts.

Mobile-first UI with a Django REST API backend.

## Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend  | Django 5+ + Django REST Framework |
| Auth     | JWT (djangorestframework-simplejwt) |
| Database | SQLite (dev) → PostgreSQL (production) |

## Quick Start

### One-command launch (PowerShell)
```powershell
.\start.ps1
```
Then open `http://localhost:5173` (or whatever port Vite picks) in your browser.

### Manual start

**Backend** (in one terminal):
```powershell
cd backend
py manage.py runserver 8000
```

**Frontend** (in another terminal):
```powershell
cd frontend
npm run dev
```

## First-time setup

Backend dependencies:
```powershell
cd backend
py -m pip install -r requirements.txt
py manage.py migrate
```

Frontend dependencies:
```powershell
cd frontend
npm install
```

## Features

- **Dashboard** — total balance, per-account balances, monthly summary, recent transactions
- **Projects** — income sources (recurring, contract, one-time, installments) with Record Receipt
- **Accounts** — bank + cash accounts with live balances, transfers, editable transactions
- **Bills & Loans** — recurring expenses, payables, receivables with monthly payment tracking
- **Reports** — monthly forecast vs actual
- **Auth** — JWT login/signup, each user's data is fully isolated

## API Endpoints

```
POST /api/auth/register/
POST /api/auth/login/
POST /api/auth/refresh/
GET  /api/me/
GET  /api/dashboard/
GET  /api/forecast/<year>/<month>/
CRUD /api/accounts/
CRUD /api/projects/
CRUD /api/transactions/
CRUD /api/expenses/
CRUD /api/receivables/
CRUD /api/payables/
```

## Railway / Production

Set backend vars: `SECRET_KEY`, `DEBUG=False`, `DATABASE_URL`, `FRONTEND_URL`  
Set frontend var: `VITE_API_URL` (backend public URL, no trailing slash)

See backend `Procfile` for migrate + gunicorn start.
