# Setup verification — 12 November 2026

Target repository: https://github.com/rakmol/Rova (public; empty when inspected).

**Prepared and tested locally. GitHub upload/hosted Actions execution is pending an authenticated connection with repository write access.** No Expo cloud native build, signing-key creation/rotation, Play upload, paid-plan change or physical-device/road test was performed by this setup.

| Check | Local result |
|---|---|
| Fresh root `npm ci` in an isolated export, without the working `node_modules` | Passed; existing MapLibre compatibility hook applied |
| Pinned Node/npm check and all three Expo public app identities/assets | Passed |
| All workspace TypeScript checks, including a clean export | Passed |
| API/admin correctness lint and existing Expo lint | Passed |
| Build/repository policy regressions | 4 passed |
| QA traceability/acceptance guard tests | 2 passed |
| API unit/contract tests | 54 passed; DB placeholder skipped here and executed separately |
| Real disposable PostGIS integration tests | 17 passed, no skips |
| Mobile tests | 126 passed across 41 suites |
| Admin browser flows | Both passed using committed default wait settings |
| Clean-export API and Next.js production builds | Passed |
| Android JavaScript/Hermes compilation | Passed; this is not an APK/AAB or native compatibility test |
| Workflow definitions | Pinned Actionlint 1.7.12 passed; external shellcheck/pyflakes were not run locally |
| Dependency audit | 0 Critical, 0 High, 31 Moderate, 1 Low; High/Critical and registry errors block CI |
| Source credential scan | Pinned, checksum-verified Gitleaks 8.30.1 found no leaks in the public-source candidate |

Raw logs, dependency reports, private working copies and exported native-independent test artifacts remain under ignored `qa/evidence/ci-2026-11-12/`. Private audit working papers, real `.env` values, signing files, generated artifacts and the original nested mobile Git history are not part of the public-source export. The old mobile lockfile was backed up locally before removal; the root lockfile is canonical.

Create the protected main-branch/ruleset and Android environments described in [the runbook](README.md) after connecting GitHub. Keep cloud builds disabled until the owner explicitly sets `EAS_BUILDS_ENABLED=true`, configures the environment-scoped Expo access token and bootstraps the appropriate remote credentials. Production URL/localization preflights and independent field/legal/privacy/provider/operations acceptance remain required. Build configuration is not public-release approval.
