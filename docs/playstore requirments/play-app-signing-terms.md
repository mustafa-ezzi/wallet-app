# Google Play — Play App Signing terms (plain language)

**What this is:** A plain-language reading of the Play App Signing Terms of Service. It is not a second contract and it is not legal advice. If this file and the official terms ever differ, the official terms win.  
**Official source:** [Play App Signing Terms of Service](https://play.google.com/about/play-app-signing-terms/) (effective **1 August 2021**)  
**Sits on top of:** the Google Play Developer Distribution Agreement and the Play Developer Programme Policies. Together those are “the Agreement.” If these signing terms conflict with the Agreement, **these terms win for Play App Signing**.  
**Practical how-to (not part of the terms):** [Use Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) · What a bundle is: [android-app-bundles.md](./android-app-bundles.md)  
**Written:** 17 October 2026

One line: **to publish an Android App Bundle you let Google hold the app signing key, and you cannot take that key back.**

Words like “You” and “Service” below mean the developer account and Play App Signing.

---

## 1. What you are agreeing to

Enrolling the developer account in Play App Signing adds these terms to the agreements you already accepted. Using the service after a change to the terms counts as accepting the change (section 5).

---

## 2. The bundle, the key, and what you can still download

**An Android App Bundle is how apps are published on Play.** Publishing a bundle requires Play App Signing. The service is what makes bundles work, and it is how Google stores the key that signs the APKs users install.

To enroll, you pick one:

| Choice | What happens |
| --- | --- |
| **Google creates the key** | Google generates the app signing key and stores it. This is the normal choice for a new app. |
| **You hand over a key** | You give Google an app signing key you already use. Google then stores that key. |

You can still:

- Download and look at the APKs Play actually distributes.
- Download **one installable APK**, signed with the key Google stores, and redistribute that APK yourself.

You get the signed file. You do not get the private key that signed it.

---

## 3. What Google is allowed to do with the bundle

For as long as the app exists, you give Google a non-exclusive licence, on top of the rights in the Developer Distribution Agreement, to:

1. Turn the Android App Bundle you upload into APKs.
2. Change those APKs to improve **performance, security, and/or size**.

That work does not change what the app is for. Google is packaging and optimising the build, not turning it into a different product.

---

## 4. Enrollment is permanent

Once the app signing key is given to Google, or Google creates it:

- **You cannot get the key back.**
- Google may keep a backup of the key **indefinitely**, for disaster recovery.

There is no later export of that private key.

---

## 5. Google can change these terms

Google may change the terms at any time. They must send a reasonable notice that describes the changes, and they must also post a notice in Play Console.

The new terms start:

| Who | When they apply |
| --- | --- |
| Someone who starts using Play App Signing after the notice is posted | Immediately |
| An account already enrolled | On the date written in the notice |

If you disagree, the only remedy in these terms is to **stop using Play App Signing**. Continuing to use it means you accept the new terms.

---

## 6. Checklist before the first upload

- [ ] We know publishing an AAB enrolls the app in Play App Signing
- [ ] For this new app, Google generates the app signing key (we do not need an old key from another store)
- [ ] We are not planning to copy that same private key out later. Section 4 says we cannot
- [ ] The **upload** key (the key that signs the file we send to Play) is backed up. That key is not the app signing key. Play can reset a lost upload key. Play will not return the app signing key
- [ ] We accept that Play may rebuild and optimise the APKs it generates from the bundle, without changing the app’s purpose

---

## 7. How this applies to WalletTrails

The production EAS profile already builds an **app bundle** (`mobile/eas.json` → `production` → `buildType: "app-bundle"`). Play will not take that bundle unless Play App Signing is on. The first upload of `com.wallettrails.app` should use Google’s default: **Google creates and keeps the app signing key.**

EAS creates a separate **upload keystore** and signs the bundle with it. Back that keystore up from Expo when the first production build offers it. Updates must keep using it. If it is lost, ask Play to reset the upload key. Do not expect Play to hand back the app signing key.

Preview and development builds in this repo are APKs for sideload. They are not the artifact these terms cover. Play production stays an app bundle.
