# Mobile apps (Android & iOS)

Both native projects are scaffolded and committed (`android/`, `ios/`)
using [Capacitor](https://capacitorjs.com), with brand-correct icons
and splash screens already generated for every required size. Neither
has been compiled here — see "What this sandbox could not do" below —
but both are ready for you (or anyone with the right local tooling) to
open and build.

## Why `server.url`, not a static export

Khayali is a server-rendered Next.js app: Server Actions, per-tenant
dynamic dashboard routes, API routes (PDF/ZIP export, Stripe webhooks).
A static export (`next export`) can't power any of that — Server
Actions and dynamic server rendering don't exist in a static bundle, so
exporting would mean rebuilding large parts of the app around
client-side data fetching for no real benefit.

Instead, `capacitor.config.ts` sets `server.url` to the live deployed
site. The native app is a thin WebView shell — it loads the real
Next.js app over the network, exactly like a browser would. This is a
completely standard, common pattern for wrapping a dynamic web app as
an installable native app; it costs nothing in engineering complexity
because the web app itself needs zero changes. `mobile-www/index.html`
is only a local fallback Capacitor requires to exist — in normal
operation the app navigates straight to `server.url` and that file is
never shown.

**Before building either platform**, set `server.url` in
`capacitor.config.ts` to your real production domain (see
`docs/NEEDS_FROM_ME.md` — no domain is registered yet, so it's
currently a placeholder). A Vercel preview URL works fine for local
testing in the meantime.

## What this sandbox could not do

- **Android**: the Capacitor CLI itself needs no SDK and ran fine here
  (`npx cap add android`, icon/splash generation). *Compiling* an APK
  needs the Android SDK (`platform-tools`, `build-tools`,
  `platforms;android-XX`), which downloads from `dl.google.com` — this
  sandbox's network policy blocks that host (same policy block as
  Supabase earlier in this project's history, confirmed directly: a
  request to `dl.google.com` gets a `403` at the proxy gateway, not a
  transient failure). Gradle and Java are installed here, but without
  the SDK there is nothing for Gradle to build against.
- **iOS**: fundamentally needs a Mac with Xcode installed — there is no
  Linux path to compiling, signing, or running an iOS build, sandbox or
  not. The Xcode project itself (`ios/App`) is fully scaffolded and
  ready to open on a Mac.

Both `android/` and `ios/` passed everything that *doesn't* need native
tooling: the projects were generated cleanly by the Capacitor CLI
against the current web app config, and every launcher icon, adaptive
icon layer, and splash screen was generated at every required
resolution via `@capacitor/assets` from the same brand mark used
everywhere else (`assets/mobile/icon.png` et al. are the source files,
regenerate with `npx capacitor-assets generate` after changing them).

## Building Android (needs Android Studio)

1. Install [Android Studio](https://developer.android.com/studio) —
   it bundles the SDK, so this alone solves the `dl.google.com` problem
   a plain sandbox has.
2. Set `server.url` in `capacitor.config.ts`, then `npm run cap:sync`.
3. `npm run cap:android` opens the project in Android Studio.
4. Run on an emulator or a plugged-in device for a debug build. A
   release build (for the Play Store) needs a signing keystore you
   generate and keep secure yourself — Android Studio's Build menu
   walks through this (Build → Generate Signed Bundle/APK).
5. Play Store submission needs a Google Play Console account (one-time
   $25 registration fee) and a store listing (screenshots, description,
   privacy policy URL, content rating questionnaire).

## Building iOS (needs a Mac + Xcode)

1. Install Xcode from the Mac App Store, plus CocoaPods
   (`sudo gem install cocoapods`).
2. Set `server.url` in `capacitor.config.ts`, then `npm run cap:sync`.
3. `npm run cap:ios` opens the project in Xcode.
4. You'll need an [Apple Developer Program](https://developer.apple.com/programs/)
   membership ($99/year) to run on a real device or submit to the App
   Store — Xcode's Signing & Capabilities tab handles provisioning once
   you're enrolled.
5. App Store submission goes through App Store Connect: screenshots for
   each required device size, a description, a privacy policy URL, and
   Apple's review (typically 1-3 days, sometimes longer for the first
   submission from a new developer account).

## What to change before either store submission

- `capacitor.config.ts`: `server.url` → your real domain, `appId` if
  you want something other than `com.khayali.app` (this has to be
  decided before first submission — changing it later means a new app
  listing, not an update to the existing one).
- App name, screenshots, and store descriptions — none of this is
  generated; it's a store-listing task once the app is otherwise ready.
- Both stores require a live privacy policy URL — `docs/en/privacy.md`
  exists in this repo but isn't yet published anywhere public-facing.
