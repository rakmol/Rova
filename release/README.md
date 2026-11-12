# Android CI and release runbook

Prepared 12 November 2026. **This is build preparation, not Play publication or safety/legal acceptance.** No cloud native build, device/road test, signing-key rotation or store submission was performed by this setup.

## Repository and CI activation

The intended repository is https://github.com/rakmol/Rova. It was public and empty when inspected. The working workspace root is not a Git checkout; `apps/mobile/.git` is an unrelated local history with no remote. Do not add that folder to a parent repository as a Git submodule or discard its history.

`node scripts/export-repository.mjs C:/absolute/new/directory` creates a clean monorepo copy outside this workspace. It excludes private `.env` files, credentials, generated native/build files, raw OSM downloads, local measurements, private audit working papers, evidence and nested Git metadata. Run secret scanning and `npm run ci:hygiene` in the new Git checkout before publishing. Keep private audit evidence in a separate restricted store. Only public example environment files belong in Git.

CI runs on PRs and pushes to main/master. Five independently visible jobs cover full-history redacted Gitleaks scanning, repository hygiene, a clean dependency installation, policy/configuration tests, correctness lint, every workspace's TypeScript checks, mobile/API unit/contract tests, a real disposable PostGIS database, Chromium admin flows, builds and Android JS compilation. Compiling JS is not an APK build or a device test.

Require all five CI jobs in main branch protection; require a reviewer and prevent force-pushes. Use a ruleset/repository settings appropriate to your GitHub plan. Workflows deliberately use `pull_request`, not `pull_request_target`, grant read-only repository permissions, disable checkout credential persistence, pin action commits and keep build secrets out of PR jobs. Dependency download cache is keyed by the sole root lockfile; `node_modules` is not cached. Gitleaks CLI has an independently pinned binary digest and requires no commercial action licence. Pin updates need normal review.

## Pinned inputs and installation

Use Node **24.13.0**, npm **11.6.2**, EAS CLI **27.7.2**, Expo SDK **58**, and the root `package-lock.json`. The repository normalizes source line endings to LF. Generate acceptance evidence from a clean checkout, not a differently normalized working copy. Run `npm ci` at the monorepo root, never a separate install in `apps/mobile`. The stale mobile lockfile was backed up to ignored local evidence and removed. MapLibre's existing version-checked codegen compatibility patch runs during installation and is tracked in source.

Cloud Android profiles pin `ubuntu-26.04-jdk-17-ndk-r27b-sdk-58` (Java17 / NDK27.1.12297006). Node is explicitly overridden to the pinned version. The pre-install hook verifies npm/Node and fails clearly on mismatch. CLI/config changes require a reviewed toolchain update and rebuild. Local EAS builds ignore several cloud image/tool-version fields, so install the pinned tools yourself. Current SDK-compatible lint dependencies still emit deprecation notices, and Moderate/Low audit findings remain a maintenance backlog; no forced incompatible major upgrade was applied. Signing timestamps, remote version counters and remote infrastructure mean this is **reproducible input configuration, not a promise of byte-identical signed binaries**.

```sh
npm ci
npm run ci:policy
npm run ci:config
npm run lint
npm run typecheck
npm run test --workspace @rova/mobile -- --testTimeout=30000
npm run test --workspace @rova/api
```

The integration workflow uses a digest-pinned PostGIS16/3.4 container with a synthetic local-only password. Its test DB must start with `rova_test_`; tests intentionally reset that disposable schema. Never supply a production database URL. Browser fixtures create a separately guarded `rova_test_admin_e2e_*` database on the same disposable container. Runtime provider credentials are not needed for CI; adapters are mocked only in automated tests.

## Application identity, assets and versioning

| Profile | Android package / namespace | Artifact | Purpose |
|---|---|---|---|
| development | `gh.rova.mobile.dev` | APK + development client | Metro / Fast Refresh, separate phone data |
| preview | `gh.rova.mobile.preview` | standalone APK | internal testing without Metro |
| production-apk | `gh.rova.mobile` | standalone APK | controlled release-device validation |
| production | `gh.rova.mobile` | AAB | Play release candidate; no automatic publication |

Production retains the existing intended ROVA package. Do not rename it after Play publication. Dev and preview IDs prevent overwriting the store app. Older development APKs used `gh.rova.mobile`; a new `.dev` installation has separate OS data and permissions. Keep the older installation until you intentionally back up or erase its saved data. Google-services/Firebase client configuration must match the chosen package if enabled later; remote push remains pending Firebase setup.

`release/version.json` supplies the visible semantic version and minimum Android version code. EAS remotely manages and increments real version codes. Before the first automated build, inspect/synchronise the remote counter above **all previously issued codes** (last locally documented legacy code:3); never reset it. The local floor is4. Record the actual value from the completed artifact, not the floor. A retried native build consumes another code. Keep npm root/mobile package versions and release notes in sync when changing the public version; regenerate the root lockfile with `npm install --package-lock-only --ignore-scripts`.

The existing ROVA icon, adaptive foreground/background/monochrome assets and a branded light/dark splash are configured in `app.config.ts`. Inspect launcher cropping and Android12+ system splash on real devices, including themed icons and dark mode. Screenshots/store graphics require owner review; never manufacture screenshots as evidence. Native splash behaviour cannot be established in Expo Go.

## Signing credentials and first build

EAS uses managed remote Android credentials. The uploader's key is different from Google's Play app-signing key. Record package, key alias and public certificate SHA-256 fingerprints in your restricted release inventory. Keep an encrypted offline keystore backup and recovery instructions in a password manager/restricted vault; use two responsible recovery contacts. Never rotate or regenerate an existing production key just to repair a build. Use Play App Signing for the store signing key and its documented upload-key reset process if necessary.

From `apps/mobile`, after Expo authentication, the owner must perform the first interactive build/credential setup for each new app ID, using the **pinned** CLI. This can consume cloud build quota:

```sh
npx eas-cli@27.7.2 credentials --platform android
npx eas-cli@27.7.2 build --platform android --profile development
```

No keystore, `credentials.json`, Play service-account JSON, Firebase admin key or Expo access token belongs in the repository, build logs, APK, artifact upload or chat. Public `pk.*` Mapbox tokens are included in the app; use dedicated restricted production tokens. Geoapify, Supabase server secrets, database credentials and storage-signing keys belong only to the backend.

## Manual cloud workflow

Create protected GitHub environments `android-development`, `android-preview`, `android-production-apk`, `android-production`. Restrict them to main; require owner/release-reviewer approval for the two production environments. Set an environment-scoped `EXPO_TOKEN` secret with the narrowest Expo account/project role available. Set `EAS_BUILDS_ENABLED=true` only when deliberately enabling cloud quota use. It defaults to disabled. These remote settings cannot be provisioned without an authenticated repository connection; YAML does not by itself create required reviewers.

Configure public app endpoints/tokens in Expo's named development/preview/production environments, not in committed files. The production preflight rejects tunnels, local/private/placeholder hosts, credential-bearing URLs, secret `sk.*` client tokens, enabled unaccepted Ghana live-traffic features and an incorrect app ID. Human English copy/pronunciation review remains required for production; development/preview builds permit review work without claiming approval. Optional auth/notification/offline endpoints may stay unset only while their features are unavailable; explain disabled features honestly.

The Actions **Android build (manual)** workflow first reruns CI, permits builds only from main and waits for the selected environment approval. It does not trigger on every commit and contains no submit/publish command. A successful build produces a credential-free manifest with reviewed commit, build ID, profile, actual version code and artifact SHA-256. Internal download URLs are omitted. Review the artifact in Expo using the recorded build ID. There is no automatic paid-plan upgrade or automatic overage authorisation.

Local Android builds are an alternative on supported Linux/macOS infrastructure with the Android SDK/NDK, JDK17 and pinned Node/npm installed:

```sh
cd apps/mobile
npx eas-cli@27.7.2 build --platform android --profile development --local
```

Windows local EAS builds are not officially supported; WSL is a development option with limitations. Android Studio/Gradle native generation is another local workflow; do not commit CNG-generated `android/` or manually maintain it alongside app config. Cloud build configuration alone is not evidence that a native build was completed.

## Acceptance and publication

Follow [device testing](ANDROID-TESTING.md), [Data safety preparation](PLAY-DATA-SAFETY.md) and [rollout](ROLLOUT.md). `npm run qa:release -- <automated.json> <field.json>` must accept current hashed evidence before release-owner publication approval. CI green alone never establishes road safety, legal/provider clearance or operational readiness. Production AAB builds are candidates for review, not permission to publish. No Play upload credentials or automatic submit workflow are configured.

## Costs checked 12 November 2026

- Local development/testing and local Android tools do not require a Play account; your hardware, data and electricity are separate costs.
- Expo currently lists a Free plan with15 Android and15 iOS cloud builds and a low-priority queue. Quotas are not unlimited and can change; inspect your account before enabling the manual build workflow. Paid plans/extra usage are optional commercial services, not a requirement for writing the app.
- Google Play developer registration currently costs **US$25 once**. That fee is separate from Expo and is not required merely to sideload a test APK. Backend hosting, map/search providers and other operating usage remain separate.
- Standard GitHub-hosted runners are currently free for public repositories; private repositories and storage/other runner usage have plan-specific allowances. Configure budgets/retention and review current billing rather than assuming unlimited CI resources.

Sources: [Expo pricing](https://expo.dev/pricing), [Play registration](https://support.google.com/googleplay/android-developer/answer/6112435), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Expo build infrastructure](https://docs.expo.dev/build-reference/infrastructure/), [local build limitations](https://docs.expo.dev/build-reference/local-builds/), [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756), [GitHub workflow security](https://docs.github.com/en/actions/reference/security/secure-use).
