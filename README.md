# Wallet Manager

Personal finance management app — mobile-first glassmorphism UI with a full Django REST API backend.

## Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend  | Django 6 + Django REST Framework |
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

Backend dependencies are already installed. If you reinstall:
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

- **Dashboard** — total net worth, per-account balances, monthly summary, recent transactions
- **Projects** — track income sources (recurring, contract, one-time, installments)
- **Accounts** — bank + cash accounts with live balance calculation, transaction history
- **Reports** — monthly forecast vs actual, breakdown charts, recurring expenses, loans/payables
- **Add Transaction** — quick-add income or expense from any screen (FAB on mobile, button in sidebar on desktop)
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

## Production Checklist

1. Change `SECRET_KEY` in `backend/wallet_manager/settings.py`
2. Set `DEBUG = False`
3. Switch database to PostgreSQL (update `DATABASES` setting)
4. Run `py manage.py collectstatic`
5. Deploy backend to Railway / Render / DigitalOcean
6. Deploy frontend to Vercel / Netlify (set `VITE_API_URL` env var)
