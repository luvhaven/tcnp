# TCNP Central — native app

The installable TCNP app for Android and iPhone, built with React Native (Expo).

It is a native shell: the app owns what a web page cannot do on a phone, and
shows TCNP's existing screens (served from `https://tcnp.vercel.app`) inside it.

| Part | Where |
|---|---|
| Background location (works with the phone locked) | `src/location.ts` |
| The screen, navigation, offline and error states | `App.tsx` |
| Encrypted on-device storage for the upload token | `src/storage.ts` |
| Messages to and from the web screens | `App.tsx` ↔ `../lib/native-shell.ts` |
| Server address the app uploads to | `../app/api/location/ingest/route.ts` |

Officers who have not installed the app keep using TCNP in the browser or from
the Home Screen exactly as before; nothing here changes that.

## How location sharing works in the app

1. The officer switches location sharing on in TCNP (same switch as on the web).
2. The app asks for location permission, then explains and asks for "Always".
3. TCNP's server issues this phone an upload token (stored encrypted on the phone).
4. The operating system delivers positions to the app in the background; each
   is sent to `/api/location/ingest`. On Android a permanent notification shows
   while sharing is on; on iPhone the status bar shows the location indicator.
5. Switching sharing off, signing out, or another officer signing in on the
   same phone stops it.

## Commands

```bash
npm install          # once
npm run typecheck    # TypeScript
npm run doctor       # Expo project checks
npx expo start       # development server (needs a development build on the phone)
```

## Building the installable app

Builds run in Expo's cloud (EAS), so no Android Studio or Mac is needed.

```bash
npx eas-cli@latest login                 # free Expo account
npx eas-cli@latest init                  # once: links this project to the account
npm run build:android                    # produces an .apk officers can install directly
npm run build:ios                        # needs an Apple Developer account ($99/year)
```

The project is linked to the Expo account `tcnpjourney`, which also holds the
Android signing key. Every update must be signed with that same key or phones
refuse to install it over the old version, so builds must keep using it.

Only `mobile/` is uploaded to Expo; the `.easignore` at the repository root
keeps the website, the desktop program and working files out of the upload.

### Publishing the Android app

The download page links to
`https://github.com/luvhaven/tcnp/releases/latest/download/TCNP-Central.apk`.
"latest" serves files from one release only, and the Windows installer uses
the same address, so both files must be attached to the newest release:

```bash
# save the .apk the build links to as TCNP-Central.apk, then
gh release upload <tag of the newest release> TCNP-Central.apk --clobber
```

Raise `version` and `android.versionCode` in `app.json` before each new build;
Android will not install a build whose `versionCode` is not higher.

The Android build prints a download link for the `.apk`. For iPhone, EAS asks
for the Apple account during the build and can submit to TestFlight with
`npx eas-cli@latest submit --platform ios`.

## Before the first public release

- `com.tcnp.central` in `app.json` is the app's permanent identity on both
  stores. Change it before the first release if a different one is wanted; it
  cannot be changed afterwards.
- The database migration `supabase/migrations/20261127100000_location_device_tokens.sql`
  must be applied, or the app cannot start sharing.
- Notifications with the app closed are not in this version (they need a
  Firebase project for Android and the Apple account for iPhone).
