# Google Play launch — status (10 October 2026)

Living tracker for the first production launch. Use [`GOOGLE_PLAY_LAUNCH_CHECKLIST.md`](./GOOGLE_PLAY_LAUNCH_CHECKLIST.md) as the full form; this file records **what is done in repo/product** vs **what you still do in Play Console / EAS**.

| Item | Status | Notes |
|------|--------|--------|
| Privacy policy URL live | **Done** | https://wallettrails-landing.up.railway.app/privacy.html |
| Policy §11 in-app deletion | **Done** | Updated in `wallettrails-site`; deploy landing site after merge |
| Delete-account help page | **Done** | https://wallettrails-landing.up.railway.app/delete-account.html (after deploy) |
| Privacy link in app | **Done** | Settings → Privacy policy (Android + web) |
| In-app account deletion | **Done** | Settings → Delete my account (Android + web); `DELETE /api/me/` |
| Notification access disclosure | **Done** | Prominent sheet/alert before opening Android Notification access |
| SMS onboarding disclosure | **Done** | Onboarding + `BANK_SMS_UX` copy before SMS permission |
| Splash / PowerPulse footer | **Done** | `AnimatedSplashScreen.tsx` |
| Widget preview branding | **Done** | `mobile/assets/images/widget-preview.png` (rebuild AAB to ship) |
| Production AAB | **You** | `eas build --platform android --profile production` (use global `eas-cli`) |
| Keystore backup | **You** | Secure copy of EAS credentials / upload key |
| Play: privacy URL + Data safety | **You** | Align with PostHog (set `EXPO_PUBLIC_POSTHOG_KEY` on EAS production **or** declare no analytics) |
| Play: SMS + Notification declarations | **You** | Permissions form + demo video for bank alerts |
| Closed test 12×14 days | **You** | Personal dev account requirement |
| App access for review | **You** | `testing@gmail.com` + password in Play Console (not in repo) |
| Fresh device smoke test | **You** | On the exact AAB uploaded to Internal/Closed |

## PostHog (production)

`mobile/eas.json` production profile sets `EXPO_PUBLIC_POSTHOG_HOST` but not the project key. Either:

1. Add `EXPO_PUBLIC_POSTHOG_KEY` in the Expo dashboard for the **production** environment, **or**
2. Leave key unset and declare in Data safety that analytics/diagnostics are not collected in production.

## Reviewer bank alerts (Path A)

Document in Play Console:

1. Sign in with the demo account.
2. Settings → Bank alerts (or onboarding opt-in).
3. Enable SMS and/or Notification access; approve a draft in Inbox.

## Deploy landing after legal changes

From `wallettrails-site`: build and deploy to Railway so privacy §11 and delete-account page go live.
