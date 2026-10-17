# Android app (Expo + React Native)

`apps/mobile` is the foundation of the JobAssist Android app. It uses the existing NestJS API and the existing Keycloak realm. There is no second backend or database. It lets the user:

- sign in and out;
- see recommended jobs with match explanations;
- prepare applications;
- answer outstanding questions;
- review the prepared materials;
- follow application status and history;
- open the official application page to submit;
- report a submission (recorded as user-reported).

## Structure and UX

- **Standalone package.** `apps/mobile` is **not** an npm workspace: it has its own `package-lock.json`, and its React version is pinned by Expo SDK 57.
- **Shared code:**
  - Types and logic come from `packages/shared` as a file dependency (API types, the Smart Apply state machine and status labels).
  - Metro watches that folder.
  - No browser (Vite) code is imported.
- **Design system** (`src/theme.ts`, `src/components/`):
  - **Tokens** mirror the web app's theme (`apps/web/src/index.css`): the same indigo primary, semantic success/warning/danger colours with soft backgrounds, radii and type scale, in light and dark.
  - **Icons** are the same Lucide set as the web, imported one by one through `src/icons.ts` to keep the bundle small.
  - **Components:**
    - text, buttons (primary, secondary, ghost, danger, with loading);
    - cards, badges and banners;
    - form controls: text field with label, hint, inline error and required/optional; checkbox; radio choices; filter chips;
    - list rows and a step indicator;
    - loading, empty and error states;
    - a confirmation dialog for consequential actions.
  - **Touch targets** are at least 48 dp.
- **Navigation** (`src/navigation.tsx`, `src/components/TabBar.tsx`):
  - A bottom tab bar: Home, Jobs, Applications, Profile.
  - Each tab keeps its own stack, so switching tabs never loses your place. Tapping the active tab returns to its first screen.
  - Pushed screens have a back button. Android back pops the stack, then returns to Home, then leaves the app.
  - Screens with unsaved changes (Smart Apply settings) ask before discarding.
  - Safe areas are respected (status bar, gesture/navigation bar), and forms keep the focused field above the keyboard.
- **Screens:**

  | Screen                  | What it shows                                                                                                                                                                                                                                                                    |
  | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Home                    | The single most useful next step, computed from real data; applications needing attention; new job matches; the application pipeline; profile completeness and resumes                                                                                                           |
  | Jobs                    | Virtualised list with title search and status, minimum-score and work-mode filters                                                                                                                                                                                               |
  | Job                     | Description preview; match explanation, matched and missing required skills, gaps and recommended resume (only when the matching engine produced them); prepare, save, dismiss; open the posting (with a note that viewing doesn't apply)                                        |
  | Applications            | Smart Apply applications (with what each needs next) and tracked applications, each listed once                                                                                                                                                                                  |
  | Smart Apply application | Progress steps; required questions first; review and approve (confirmation, and it says nothing is sent); handoff to the employer's site; user-reported submission (checkbox and confirmation); failure and uncertain states; how it's submitted; history; cancel (confirmation) |
  | Tracked application     | Status and what it means; timeline                                                                                                                                                                                                                                               |
  | Questions               | Every required answer still needed                                                                                                                                                                                                                                               |
  | Profile                 | Account, profile completeness with what's missing, resumes, Smart Apply settings, saved answers, sign out (confirmation)                                                                                                                                                         |

- **States:** every data screen has loading, pull-to-refresh, empty, error-with-retry and session-expired states. Data stays on screen if a refresh fails, and typed answers are kept when saving fails.
- **Not on mobile (on the website, and said so in the app):** uploading and reviewing resumes, editing the career profile, editing cover letters, and changing a tracked application's status, notes or documents.

## Security

- **Sign-in** uses Authorization Code + PKCE (S256) through the system browser (`expo-auth-session`).
- **Public client `ai-job-assistant-mobile`:** no client secret exists or is embedded.
- **Tokens:**
  - stored only in `expo-secure-store` (Android Keystore-backed), one entry per token;
  - never kept in AsyncStorage, logs or source;
  - covered by tests that scan the source.
- **Refresh:** expiring access tokens are refreshed with the refresh token. If the refresh is rejected, all tokens are cleared and the user returns to sign-in with "Your session has ended". Offline, the tokens are kept and a retryable connection error is shown.
- **Sign-out** clears the tokens and ends the Keycloak session (best effort when offline).
- **Config:** only public values are compiled in (`EXPO_PUBLIC_*`).

## Prerequisites

- Node 22.18 (as for the rest of the repo)
- For running on a device or emulator: Android Studio (SDK and an emulator) or a physical device
- The local stack: `npm run db:up`, then the API (`npm run dev:api`)

## How sign-in works

1. **Tap Sign in.** The app first checks that Keycloak is reachable and reports the issuer the app expects (`<KEYCLOAK_URL>/realms/<realm>`). If not, it shows what to fix and does **not** open a dead browser page.
2. **The app builds the redirect URI for the runtime it is in** (`src/auth/redirect.ts`):

   | Runtime                      | Redirect URI                                                                                  |
   | ---------------------------- | --------------------------------------------------------------------------------------------- |
   | Expo Go                      | `exp://<computer-LAN-IP>:8081/--/auth/callback` (Expo Go can't register the app's own scheme) |
   | Development or release build | `jobassist://auth/callback`                                                                   |

3. **The system browser opens Keycloak's authorization endpoint** with PKCE (S256) and a random `state`. The browser appearing is expected: you sign in on Keycloak's page.
4. **Keycloak redirects to that URI**, and Android returns to Expo Go or to the app. `expo-auth-session` checks `state`.
5. **The app exchanges the code** with the original PKCE verifier and the _same_ redirect URI, and saves the tokens in secure storage.
6. **The app calls `GET /auth/me`.** If the API rejects the token, the tokens are cleared and the reason is shown.

Cancelling (closing the browser) returns to the sign-in screen with "Sign-in was cancelled". OAuth errors, invalid callbacks and failed exchanges show a clear message. Messages never include codes, tokens or verifiers.

## Keycloak client and API settings

| Setting             | Value                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Client              | `ai-job-assistant-mobile`, **public** (no secret), standard flow only, PKCE `S256`                                       |
| Valid redirect URIs | `jobassist://auth/callback` and `exp://*` (Expo Go, development only)                                                    |
| API (`.env`)        | `KEYCLOAK_MOBILE_CLIENT_ID=ai-job-assistant-mobile`; `KEYCLOAK_ISSUER_URL` must equal the issuer Keycloak puts in tokens |

The local realm file contains this client. An existing local Keycloak doesn't re-import the realm, so add the client in the admin console (<http://localhost:8180>, realm `ai-job-assistant`) with the settings above.

**Production:** no mobile client exists yet. It needs the same public client, with only `jobassist://auth/callback` as its redirect (no `exp://*`), and `KEYCLOAK_MOBILE_CLIENT_ID` on Render. Ask before changing production.

## Run on a physical phone

The phone must reach your computer's Keycloak (8180) and API (3000). Keycloak must also _issue tokens for the address the phone uses_: its login page and the token issuer follow `KC_HOSTNAME`, which defaults to `http://localhost:8180`. On a phone, "localhost" is the phone itself.

### Over Wi-Fi with Expo Go

The phone and computer must be on the same network.

1. **Find your computer's LAN IP**, e.g. `ip -4 addr` → `192.168.1.20`. This is the address Expo shows as `exp://192.168.1.20:8081`.
2. **In the repository `.env`** (development only; this exposes Keycloak, including its admin console, on your network):

   ```bash
   KEYCLOAK_PUBLIC_URL=http://192.168.1.20:8180
   KEYCLOAK_BIND_ADDRESS=0.0.0.0
   KEYCLOAK_ISSUER_URL=http://192.168.1.20:8180/realms/ai-job-assistant
   VITE_KEYCLOAK_URL=http://192.168.1.20:8180
   KEYCLOAK_MOBILE_CLIENT_ID=ai-job-assistant-mobile
   ```

3. **Recreate Keycloak** with `docker compose up -d keycloak`, then **restart the API and web app** so they read the new issuer.
4. **Start the app** with `cd apps/mobile && npx expo start`, and scan the QR code with Expo Go. No `apps/mobile/.env` is needed: the app uses the computer serving it (`192.168.1.20`) for the API and Keycloak.
5. **Tap Sign in.** The browser opens Keycloak at `192.168.1.20:8180`. Sign in, and Android asks to return to Expo Go (allow it).

To go back to localhost-only, remove those lines and run `docker compose up -d keycloak` again.

### Over USB, keeping localhost (no network exposure)

This needs `adb` (Android platform-tools) and USB debugging on.

1. Run `adb reverse tcp:8180 tcp:8180 && adb reverse tcp:3000 tcp:3000`.
2. In `apps/mobile/.env`, set:

   ```bash
   EXPO_PUBLIC_KEYCLOAK_URL=http://localhost:8180
   EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
   ```

3. Restart Expo.

Keycloak and the API keep their default `localhost` settings.

### Android emulator

Either use the USB-style `adb reverse` setup above (the emulator supports it), or the Wi-Fi setup.

### Development build (the app's own `jobassist://` scheme)

`npx expo run:android` (needs the Android SDK) builds an app that receives `jobassist://auth/callback` directly. It is the production-like path and needs no `exp://` redirect.

## Troubleshooting sign-in and connection

| Message or symptom                                                                         | Cause and fix                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “You appear to be offline or the server can’t be reached (Tried localhost:3000.)” over USB | The phone's `adb reverse` forwarding was dropped (it is lost whenever the phone reconnects or adb restarts), so `localhost` on the phone reaches nothing. Run `npm run usb` in `apps/mobile` (or `npm run start:usb`, which also starts Expo on localhost). |
| "Can’t reach the sign-in server at …"                                                      | The phone can't reach Keycloak. Keycloak is bound to `127.0.0.1` by default; use the Wi-Fi or USB setup.                                                                                                                                                    |
| "… is configured for http://localhost:8180"                                                | `KC_HOSTNAME` doesn't match the address the phone uses. Set `KEYCLOAK_PUBLIC_URL`.                                                                                                                                                                          |
| Keycloak page: "Client not found"                                                          | The mobile client is missing from the running Keycloak. Add it (see above).                                                                                                                                                                                 |
| Keycloak page: "Invalid parameter: redirect_uri"                                           | The redirect URI isn't allowed for the client. Add it (see above).                                                                                                                                                                                          |
| "… the API rejected the session"                                                           | Set `KEYCLOAK_MOBILE_CLIENT_ID`, and make `KEYCLOAK_ISSUER_URL` equal Keycloak's issuer. Restart the API.                                                                                                                                                   |

## Checks

```bash
cd apps/mobile
npm ci                 # its own lockfile
npm run typecheck
npm test               # Jest (jest-expo), no device needed
npx expo export --platform android --output-dir /tmp/jobassist-bundle   # Metro bundle check
```

| Check                                                    | Covered                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated tests                                          | Redirect URIs for Expo Go and native builds; the sign-in outcomes (success, cancel, OAuth errors, invalid callback, failed exchange, API rejection, unreachable or misconfigured Keycloak); config defaults and `EXPO_PUBLIC_*` inlining; secure token storage; refresh and expiry; the API client; key screens |
| Verified against the local stack with a headless browser | Authorization Code + PKCE login with the mobile client (both callback styles); `state` returned; code exchange; API accepts the mobile token; refresh; logout; code replay and wrong PKCE verifier refused                                                                                                      |
| **Not** verified automatically                           | The phone's browser returning to Expo Go (or the app); that needs a real device                                                                                                                                                                                                                                 |

## Push notifications (contract only)

- **Contract:** `SmartApplyNotificationPayload` in `packages/shared/src/smart-apply.ts` (event, id, link; never answers or personal data).
- **User preferences:** `notifyInputNeeded` and `notifySubmission` in Smart Apply settings.
- **Delivery today:** in-app notifications in the API.

Push delivery (e.g. FCM via `expo-notifications`) is future work and needs credentials that are deliberately not required for this foundation.
