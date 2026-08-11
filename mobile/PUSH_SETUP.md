# CashTrail Android push (FCM) setup

Campaigns / product updates need an **Expo push token** on each phone. Local test banners work without this; **remote** ops campaigns do not.

## Why you see “no push token”

Usual causes:

1. App is **Expo Go** — use a native EAS APK instead.
2. **Firebase FCM** was never wired into the Android build (`google-services.json` + FCM V1 key on EAS).
3. Notifications permission is denied.
4. Running on an **emulator** instead of a real phone.

## One-time Firebase + EAS setup

1. Create a Firebase project → add an Android app with package `com.cashtrail.app`.
2. Download **`google-services.json`** into `mobile/google-services.json` (same folder as `app.json`).
3. `app.config.js` will pick it up automatically for the next build.
4. In Firebase → Project settings → **Service accounts** → Generate new private key (JSON).
5. Upload that key to Expo:

```bash
cd mobile
npx eas credentials
# Android → production (and preview if you use preview APKs)
# Google Service Account → Push Notifications (FCM V1) → Upload key
```

Or: [expo.dev](https://expo.dev) → CashTrail project → Credentials → Android → FCM V1.

6. Rebuild and install a fresh APK (OTA JS updates are **not** enough):

```bash
npx eas build -p android --profile preview
```

7. Open the app → **Settings → Product updates → Link this device for push**.

You should see “Push linked…”. Ops Users should then show a device token for that account.

## After linking

- Admin **Campaigns** only reach users with a registered token and marketing enabled.
- Due reminders can still be local; campaigns always go through Expo’s push service + FCM.
