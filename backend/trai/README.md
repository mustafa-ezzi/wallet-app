# Trai

Copy the `trai` folder into another Django project. The folder is the conversation. Your project is the plugin: what the bot is allowed to see, which sentences it can answer, and what Save actually writes.

WalletTrails is one plugin. It lives in `api/trai_host.py` and the `api/bot_*.py` files. Leave those behind when you copy Trai into a different app.

## Install

1. Copy `backend/trai` next to your Django apps, so `import trai` works.
2. Copy `trai/example_host.py` into your app and fill in the methods. The engine never imports your models.
3. In settings:

```python
TRAI_HOST = 'yourapp.trai_host.notes_host'
```

4. Mount the two routes:

```python
path('api/bot/', include('trai.urls')),
```

That serves `POST /api/bot/message/` and `POST /api/bot/confirm/`. Both expect a logged-in user. A message body is `{ "text": "..." }`. A confirm body is `{ "id": <draft id> }`.

## What you replace

| Method | You provide |
| --- | --- |
| `catalog` | Only this user's data. No passwords, no one else's rows. |
| `route` | Sentences you can answer without the model. Return `None` to let the model try. |
| `normalize` | Turn the model's JSON into an action you will accept. Unknown actions are `refuse`. |
| `store_proposal` / `confirm` | A draft first. The write happens only inside `confirm`. |
| `message_kind` | Which words mean save, cancel, or a correction of the open draft. |

`write_actions` is the set of action names that wait for Save. Anything else is an answer, not a draft.

The model key stays on the server (`GEMINI_API_KEY`). The daily cap is `BOT_DAILY_MESSAGE_CAP`.

## WalletTrails

This project already subclasses the views and sets `host = wallet_host`, so its existing `/api/bot/message/` and `/api/bot/confirm/` paths are unchanged. The screen that draws the thread is `frontend/src/components/TraiPanel.tsx` on the web and `mobile/src/components/TraiDock.tsx` on the phone. Those files know WalletTrails pages, themes, and the amount eye. Copy them only if you want the same panel, then change what a saved action does on the device.
