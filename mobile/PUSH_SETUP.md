# WalletTrails Android push (FCM) setup

Campaigns / product updates need an **Expo push token** on each phone. Local test banners work without this; **remote** ops campaigns do not.

## Why you see “Android FCM is not configured”

That message means the **installed APK was built without Firebase** in the native layer. Common causes:

1. `google-services.json` was gitignored and **never uploaded** to the EAS builder.
2. `GOOGLE_SERVICES_JSON` file env was never created on expo.dev.
3. You installed an **older APK** (or Expo Go) instead of the new build.
4. FCM V1 service account is missing under EAS **Credentials** (needed for Expo to deliver pushes).

## Fix (do all of these, then rebuild)

### 1. Keep the file locally

Put Firebase’s Android config at:

`mobile/google-services.json`

Package must be `com.WalletTrails.app`.

### 2. Make EAS upload it (repo-root `.easignore`)

This repo has a **root** `.easignore` with:

`!mobile/google-services.json`

So the next `eas build` from `mobile/` should include the file even though git ignores it.

### 3. Also set the EAS file env (recommended backup)

```bash
cd mobile
npx eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --visibility sensitive
npx eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --visibility sensitive
```

Use **sensitive** (not secret) so config resolution can see the path. Or create the same on expo.dev → Environment variables (type **File**).

### 4. FCM V1 credentials

expo.dev → Credentials → Android (`com.WalletTrails.app`) → **Google Service Account (FCM V1)**  
Upload the Firebase **service account private key** JSON (Project settings → Service accounts → Generate new private key).  
This is **not** the same file as `google-services.json`.

### 5. Rebuild and install the new APK

```bash
cd mobile
npx eas build -p android --profile preview
```

Before building, confirm the archive includes the file:

```bash
npx eas build:inspect --platform android --profile preview --stage archive --output ./eas-archive-check
```

Look for `google-services.json` inside that folder. If it’s missing, stop and fix env/easignore first.

Install the **new** APK (uninstall the old WalletTrails first if the phone still has the previous build), open Settings → **Link this device for push**.

## After linking

- Admin **Campaigns** only reach users with a registered token and marketing enabled.
- Due reminders can still be local; campaigns go through Expo push + FCM.
