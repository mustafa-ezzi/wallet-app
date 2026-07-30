# Phase 0–1 — What to do next (run guide)

Phases **0** (foundations) and **1** (auth + tab shell) are implemented under `mobile/`. Follow this to run and verify on your phone.

---

## 1. Prerequisites

- **Node.js 20+** (LTS)
- **Expo Go** on your Android phone ([Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Same Wi‑Fi as your PC (for Expo Go QR), **or** use tunnel mode
- Your **Railway Django** backend URL (HTTPS), e.g. `https://tranquil-radiance-production.up.railway.app`

---

## 2. One-time setup

```powershell
cd d:\My-Wallet\mobile
copy .env.example .env
```

Edit `mobile/.env` — **no trailing slash**:

```
EXPO_PUBLIC_API_URL=https://YOUR-BACKEND.up.railway.app
```

Install deps (if `node_modules` is broken or incomplete):

```powershell
cd d:\My-Wallet\mobile
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
```

---

## Important: what “localhost:8081” is

`http://localhost:8081` is the **Metro bundler**, not the CashTrail UI. A blank / status page in the browser is normal.

- **Phone:** Expo Go → open `exp://192.168.1.9:8081` (use your PC’s LAN IP if different)
- **Browser UI (optional):** `npx expo start --web` then open the URL Expo prints (often `http://localhost:8081`)

First Android bundle can take **1–2 minutes**. Keep Expo Go open while Metro logs `Bundling...` then `Bundled`.

---

## Other ways to see the app (if Expo Go fails)

### A) Browser (Expo web) — easiest on PC
```powershell
cd d:\My-Wallet\mobile
npm run web
```
Open **http://localhost:8081** in Chrome. Login uses the same Railway API.

### B) Phone over USB (often more reliable than Wi‑Fi)
1. Enable USB debugging on Android  
2. Plug in phone, accept the prompt  
3. On PC:
```powershell
adb reverse tcp:8081 tcp:8081
cd d:\My-Wallet\mobile
npx expo start --localhost
```
4. In Expo Go, open: `exp://127.0.0.1:8081`

### C) Existing CashTrail web PWA
Your React web app already works — run `frontend` or open the Railway frontend URL. Same data/API; mobile is a separate RN client.

### D) Later: installable APK
```powershell
eas build -p android --profile preview
```
Install the APK on the phone (no Expo Go needed).

---

## 3. Start the app (phone must connect to Metro)

**Important:** If the phone shows only a spinner and the PC says `No apps connected`, Expo Go never reached your PC. Use **tunnel** mode (works across Wi‑Fi / firewall):

```powershell
cd d:\My-Wallet\mobile
npx expo start --tunnel -c
```

Wait until you see a QR code and something like `Tunnel ready`. Then:

1. Fully close Expo Go on the phone (swipe away)
2. Open Expo Go again
3. Scan the **new** QR from that terminal

When connected, Metro should show `Connected: 1` (or similar). Only then will reload (`r`) work.

**Same Wi‑Fi LAN mode** (faster, but often blocked by Windows firewall):

```powershell
npx expo start
```

If LAN fails, stick with `--tunnel`.

Or use the scripts:

```powershell
npm run start:clear
```

---

## 3b. Still stuck on spinner?

| Symptom | Fix |
| --- | --- |
| Terminal: `No apps connected` | Phone never linked — use `--tunnel`, same account optional, rescan QR |
| Expo Go says SDK mismatch | Update Expo Go from Play Store (needs SDK 57) |
| QR opens but hangs | Close Expo Go completely, restart with `npx expo start --tunnel -c` |
| Windows Firewall prompt | Allow Node.js on private networks |

---

## 4. Manual exit checks (Phase 0–1)

| Check | How |
| --- | --- |
| API wired | Home card shows your Railway URL, not `(set EXPO_PUBLIC_API_URL)` |
| Login works | Wrong password shows error; correct password opens tabs |
| Session persists | Force-stop Expo Go → reopen project → still logged in |
| Logout | Settings → Log out → back to login |
| Offline session | Login → airplane mode → kill/reopen → still in shell (cached user; no bounce to login) |

---

## 5. Optional: EAS (preview APK later)

Not required for Expo Go demos.

```powershell
npm i -g eas-cli
cd d:\My-Wallet\mobile
eas login
eas init
eas build -p android --profile preview
```

`eas.json` already has `development` / `preview` / `production` profiles. Package id is locked: **`com.cashtrail.app`**.

---

## 6. Notes

- **Native apps don’t use browser CORS** the way the PWA does — pointing at Railway HTTPS is enough for auth smoke tests.
- Tokens live in **SecureStore**, not AsyncStorage.
- Do **not** commit `mobile/.env` (gitignored).
- If Metro says a module is missing (`axios`, `expo-secure-store`, `netinfo`), run `npm install` again in `mobile/`.
- Template leftovers under `mobile/components/` and `mobile/constants/` are unused; safe to ignore until cleaned.

---

## 7. What’s next (Phase 2)

When P0–P1 feel good on a real phone:

1. Live **Home** (total balance, month in/out, recent txs with category + notes)
2. **Wallets** list + create
3. **Add money** FAB + bottom sheet (income / expense / transfer)

Track progress in `REACT_NATIVE_BUILD_PHASES.md`.
