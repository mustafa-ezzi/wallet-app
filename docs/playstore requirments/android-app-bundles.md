# Google Play — Android App Bundles (plain language)

**What this is:** A plain-language reading of Google’s “About Android App Bundles” page.  
**Official source:** [About Android App Bundles](https://developer.android.com/guide/app-bundle)  
**Related:** [Play App Signing terms](./play-app-signing-terms.md) — publishing a bundle requires Play App Signing.  
**Written:** 17 October 2026  
**Status:** Format notes. The official page is the source of truth if a limit or date changes.

One line: **you upload one bundle that contains everything; Play builds a smaller install for each phone and signs it.**

---

## 1. Who must use a bundle

| Rule | Since |
| --- | --- |
| **New apps** on Google Play must be published as an Android App Bundle | August 2021 |
| New apps **larger than 200 MB** are delivered with Play Feature Delivery or Play Asset Delivery, not the old expansion-file approach | August 2021 |
| **New and existing TV apps** must be published as app bundles | June 2023 |

WalletTrails is a new phone app, so the first Play release is a bundle. It is not a TV app.

---

## 2. What a bundle is

An Android App Bundle (`.aab`) is the file you upload. It holds the app’s compiled code and resources. It is not the file users install.

Play then:

1. Generates APKs from that bundle.
2. Signs them with the app signing key (see [play-app-signing-terms.md](./play-app-signing-terms.md)).
3. Serves each device only the code and resources that device needs.

You do not build a separate APK for every screen density, CPU, or language. Users download a smaller install.

If the project already keeps code and resources in the normal Android layout, building a signed bundle and uploading it is enough. Optimized delivery is automatic. Android Studio or the command line can produce the bundle. This repo produces it with EAS.

Two optional extras, neither of which this app needs on day one:

| Extra | Who it is for | What it does |
| --- | --- | --- |
| **Play Feature Delivery** | Apps that can split features into modules | A module is included only when a condition you set is true, or the app downloads it later with the Play Core library |
| **Play Asset Delivery** | Games with large asset files | Play’s way to ship those assets, with its own delivery options and its own size rules |

---

## 3. Size limit

Play measures the **compressed download**, not the size of the `.aab` on your disk.

The install must be **at most 4 GB** compressed. That is the base APK plus the configuration APKs that device needs (languages, screen density, CPU, and so on).

The same **4 GB** cap applies to each later download, such as an on-demand feature module plus its configuration APKs.

**Asset packs do not count toward this 4 GB.** They have separate limits, described on the Play Asset Delivery page.

If any possible download of the app or an on-demand feature is over the limit, Play Console rejects the upload.

Bundles **cannot** use APK expansion files (`.obb`). If the upload is too big, shrink the install:

1. Turn on split APKs for every configuration type (`enableSplit = true`). Users then download only what their device needs. If splits are off, one device can be forced to carry resources for other devices.
2. Remove unused code and resources.
3. Follow Android’s app-size guidance.
4. Only after that, move features that only some people use into on-demand feature modules. That is a real code split, so try 1–3 first.

---

## 4. Known problems

**Sideload can be incomplete.** An install that did not come from Play, and that is missing one or more required split APKs, **fails** on every Google-certified device and on every device running Android 10 (API 29) or higher. Play’s installer always delivers the full set. A single universal APK sideload is a different thing: it is one file, not a partial set of splits.

**Do not rewrite resource tables while building a bundle.** Tools that dynamically modify resource tables can make the APKs Play generates behave wrongly. Turn those tools off for the bundle build.

**Feature-module settings can fight the base app.** A module can override the base module, for example `debuggable = true` in the app and `false` in a feature. That can break the build or the running app. Modules inherit some settings from the base module by default. Keep the ones that should match, and do not restate the ones that should stay inherited.

Anything else is a bug to report to Google. It is not a second, undocumented limit.

---

## 5. Checklist for a Play upload

- [ ] The file is an `.aab`, not an APK
- [ ] Play App Signing is on, because a bundle cannot be published without it
- [ ] No `.obb` expansion file is attached
- [ ] The compressed install for a device is under 4 GB
- [ ] Sideload testers get a full APK, or they install from a Play test track
- [ ] Resource-table rewriting tools are off for the bundle build

---

## 6. How this applies to WalletTrails

| Build | File | Use |
| --- | --- | --- |
| EAS `production` | Android App Bundle (`buildType: "app-bundle"`) | The file Play accepts |
| EAS `preview` and `development` | APK | Sideload and dev clients. Do not upload these to Play production |

The app is a finance client, not a game, and it is far under 4 GB. It does not need feature modules, asset packs, or expansion files.

Install Play test builds from the Play testing link so the device receives every split. Use the preview APK only when you are sideloading on purpose. A half-copied set of split APKs will not install on Android 10 and newer.
