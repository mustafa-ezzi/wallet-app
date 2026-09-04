# WalletTrails Android push (FCM) setup

Campaigns / product updates need an **Expo push token** on each phone. Local test banners work without this; **remote** ops campaigns do not.

## Why you see “Android FCM is not configured”

That message means the **installed APK was built without Firebase** in the native layer. Common causes:

1. `google-services.json` was gitignored and **never uploaded** to the EAS builder.
2. `GOOGLE_SERVICES_JSON` file env was never created on expo.dev.
3. You installed an **older APK** (or Expo Go) instead of the new build.
4. FCM V1 service account is missing under EAS **Credentials** (needed for Expo to deliver pushes).
5. **Package rename:** `google-services.json` still lists `com.cashtrail.app` while the app is `com.wallettrails.app` → Gradle fails with *No matching client found for package name*.

## Fix (do all of these, then rebuild)

### 0. Firebase app must match package `com.wallettrails.app`

1. Open [Firebase Console](https://console.firebase.google.com) → your project.
2. Project settings → **Your apps**.
3. If you only have an Android app for `com.cashtrail.app`, click **Add app** → Android.
4. Android package name: **`com.wallettrails.app`** (all lowercase — must match `mobile/app.json`).
5. Download the new **`google-services.json`** and save it as:

`mobile/google-services.json`

6. Confirm the file contains `"package_name": "com.wallettrails.app"` (search inside the JSON).
7. Re-upload to EAS (step 3 below) so the builder does not keep using the old CashTrail file.

### 1. Keep the file locally

Put Firebase’s Android config at:

`mobile/google-services.json`

Package inside it must be `com.wallettrails.app`.

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

If the env already exists with the **old** CashTrail file, **update/replace** it on expo.dev → Project → Environment variables → `GOOGLE_SERVICES_JSON` (do not leave the old file).

Use **sensitive** (not secret) so config resolution can see the path. Or create the same on expo.dev → Environment variables (type **File**).

### 4. FCM V1 credentials

expo.dev → Credentials → Android (`com.wallettrails.app`) → **Google Service Account (FCM V1)**  
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
