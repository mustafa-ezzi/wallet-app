# WalletTrails analytics agent

Scheduled, read-only product report for the WalletTrails Django app. It reads the same database the API uses, calculates aggregates, and publishes `analytics.json` at the repository root.

The job does not insert, update, or delete application data. If a run fails validation or the database, the previous `analytics.json` stays in place.

## What it measures

Counts and windows come from models that already exist:

| Report field | Source |
| --- | --- |
| Users, new users, signups | `auth.User.date_joined` |
| Active users (1/7/30 days) | Same signals as the ops dashboard: `last_login`, `UserOpsMeta.last_seen_at`, transaction `created_at`, device-token `updated_at` |
| Suspended users | `User.is_active` or `UserOpsMeta.suspended_at` |
| Transactions, accounts, projects, bills, households, bank-SMS imports, budgets, support threads, entitlements | Row counts and `created_at` / `date_joined` |
| Personal income and expense | `Transaction.amount` in PKR, excluding category `Bank Transfer` and rows with a `people_action`, matching `DashboardView` |
| Expense and income categories | Those same personal transactions, top labels in the window |
| Premium, push, travel mode, bank-SMS settings | `Entitlement`, `DeviceToken`, `TravelMode`, `BankSmsImportSettings` |

Daily activity uses `Transaction.date`. "New records" uses `created_at` (or `date_joined` for users). Those two numbers differ when a transaction is backdated.

Household expense **amounts** are not summed. A household can use a currency other than PKR, and a row may also be linked to a wallet transaction.

The report has no names, emails, phone numbers, account names, notes, SMS text, tokens, or per-user amounts. Category labels are trimmed and control characters are removed.

## Layout

| Path | Role |
| --- | --- |
| `fetch.py` | Read-only queries |
| `metrics.py` | Totals, growth, rollups, anomalies |
| `insights.py` | Rule summary, or an optional LLM summary of those numbers |
| `schema/analytics.schema.json` | Schema checked before publish |
| `output.py` | Temp file, re-validate, then `os.replace` |
| `lock.py` | One run at a time |
| `db.py` | Statement timeout and a read-only session |

Anomaly rule: for each day in the window, compare it with the other days. Flag it when the absolute z-score is at least 2, or when every other day is identical and this day is not. Windows shorter than 7 days are not scored.

## Install

From the repository root:

```powershell
py -m pip install -r analytics_agent\requirements.txt
```

That installs the backend requirements (Django and the Postgres driver), `jsonschema`, `tzdata`, and `pytest`.

## Configure

```powershell
copy analytics_agent\.env.example analytics_agent\.env
```

Set `DATABASE_URL` to a PostgreSQL URL this computer can reach. The agent will not start without it, and it will not read local SQLite. The Postgres session is read-only (`default_transaction_read_only`).

On Railway, `postgres.railway.internal` works only for the deployed API. From your PC, use the public URL from the Postgres service (public networking). The host looks like `*.proxy.rlwy.net`.

`ANALYTICS_CRON` is stored in the report. The operating system scheduler is what starts the process. Keep the task time aligned with that cron expression. The default is `15 2 * * *` (02:15 Asia/Karachi).

Optional LLM summary: set `ANALYTICS_LLM_API_KEY`. The model only receives aggregate numbers and sanitized category labels, wrapped as untrusted data. If the call fails, the report still publishes with the rule-based summary and `status.state` of `partial`.

## Run once

From the repository root:

```powershell
py -m analytics_agent
```

Other useful forms:

```powershell
py -m analytics_agent --period-days 7
py -m analytics_agent --dry-run
py -m analytics_agent --output analytics.json
```

`--dry-run` prints the validated JSON and does not replace `analytics.json`.

Exit codes: `0` published (or dry-run validated), `1` failed and the previous file was kept, `2` another run holds the lock.

Logs go to stderr and `analytics_agent\logs\analytics-agent.log`.

## Schedule on Windows

Register a daily task at 02:15 for the current user. The task runs when that user is logged on:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File analytics_agent\schedule\register-windows-task.ps1
```

Run it immediately, or remove it:

```powershell
schtasks /Run /TN "WalletTrails Analytics"
schtasks /Delete /TN "WalletTrails Analytics" /F
```

The registered command is `analytics_agent\schedule\run-analytics.cmd`, which changes to the repository root and runs `py -m analytics_agent`.

A different time, still in 24-hour `HH:MM` form:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File analytics_agent\schedule\register-windows-task.ps1 -Time 06:00
```

If you change the time, set `ANALYTICS_CRON` to the same minute and hour so the report's `schedule` field matches the task.

## Schedule on Linux

```bash
crontab -e
```

Add the line from `analytics_agent/schedule/cron.example`, with the real repository path and Python:

```cron
15 2 * * * cd /path/to/My-Wallet && /usr/bin/python -m analytics_agent
```

That fires at 02:15 in the host's timezone. Set the host zone to Asia/Karachi, or convert 02:15 PKT to the host clock (21:15 UTC the previous evening).

## Tests

```powershell
py -m pytest analytics_agent\tests -q
```

The tests cover growth and anomaly math, JSON Schema validation, atomic publish when validation or replacement fails, a crashed lock, overlapping runs, and LLM fallback. They do not need a database.

## Output

`analytics.json` includes `generated_at`, `period`, `metrics`, `trends`, `insights`, and `status`. `status.read_only` is always true. `status.state` is `ok` or `partial`. A failed run does not write `failed` over a good file.

The file is gitignored. It contains platform-wide PKR totals, so keep it on the operator machine.
