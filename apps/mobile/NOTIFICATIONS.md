# Optional notifications and reminders

Step 17 adds Settings → Optional notifications and a read-only road/policy inbox.
Navigation and guest mode work without notifications, permission or an account.
All categories start off. There is no marketing channel and no current-trip targeting.

## What works locally

Insurance and roadworthiness dates are entered as YYYY-MM-DD. No document, vehicle
registration or policy numbers are requested. Dates/preferences are encrypted with
AES-256-GCM in a separate transactional file; its device-only key and notification
installation credential use SecureStore. They are not part of account backup, route
history or offline map downloads. Erase cancels ROVA reminder identifiers, deletes
both encrypted slots and the key, then requests deletion of the remote registration.
If that request fails, a secure pending-deletion marker retries on foreground resume.

After explicit permission, reminders are scheduled at **09:00 Africa/Accra**, seven
days before, one day before and on the due date. Past occurrences are skipped. Up to
two renewal types, two reminders/day, six in a rolling seven-day window, max32 pending.
These are absolute date triggers; travelling does not change their intended Ghana time.
Permission is never requested at app startup. Android channels are created before an
explicit permission request. Denial, revoked permissions and an older APK without the
native module have visible states. Failed scheduling cancels the partial plan and turns
reminders off. Android battery restrictions and inexact alarms can delay notifications;
ROVA does not request exact-alarm permission or guarantee renewal delivery.

## Remote delivery is disabled pending Firebase

`PUSH_DELIVERY_ENABLED=false` is the default. No Firebase project, service account or
real message delivery was configured or tested in this change. Preferences can be
saved while remote setup is pending. Do not claim notifications were delivered from
an Expo ticket or receipt: a receipt confirms provider handoff, not phone display.

When ready:

1. Add Android app `gh.rova.mobile` to your Firebase project. Download its client
   `google-services.json` to a private local directory. Set `GOOGLE_SERVICES_JSON` to
   that file path (or an EAS file environment variable). The dynamic Expo config uses
   it only when provided. Never put a Firebase service-account private key in mobile.
2. Configure FCM v1 credentials with EAS for this Expo project, following the current
   [Expo FCM guide](https://docs.expo.dev/push-notifications/fcm-credentials/).
3. Enable Expo enhanced push security. Put its server-only access token in API
   `EXPO_PUSH_ACCESS_TOKEN`. Generate a random 32-byte hex `NOTIFICATION_TOKEN_KEY`
   locally, set `NOTIFICATION_TOKEN_KEY_ID=push-v1`, and securely retain the key.
   Rotating keys without migration disables delivery for old ciphertext; ask users to
   save/register again or perform a controlled server-side re-encryption migration.
4. Run `npm run db:migrate` against the intended backend database (migration011).
   Use a public HTTPS API and set mobile `EXPO_PUBLIC_NOTIFICATIONS_API_URL` to its
   `/v1/notifications` endpoint. Metro's allowlisted proxy is for development only.
5. Build a new APK including `expo-notifications` and its config plugin. Older APKs
   show an update-required state. The existing APK cannot gain this native module
   through Fast Refresh. Test on a physical Android phone before enabling delivery.
6. Only after credential/device checks, set `PUSH_DELIVERY_ENABLED=true`. Schedule
   `npm run notifications:work --workspace @rova/api` once/minute on your backend.
   The command is disabled by default; no automatic sender runs in the API process.

See [Expo notification API](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/)
and [push sending/receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
Provider quotas, Firebase/EAS plans and applicable pricing must be checked before
production; this implementation does not purchase a service or enable billing.

## Remote consent, evidence and limits

- Saved-region closures: explicitly choose up to5 Ghana saved places; the client
  derives coarse region IDs and rounds centres to .02° (about2km). Only generic
  region labels and those coarse centres are uploaded. Matching radius is5km.
  Current trip coordinates, raw routes and renewal dates are never uploaded here.
- Closure events must be active, non-demo, **community-reviewed**, not claims of
  authority verification. Current status and proximity are checked again before
  enqueue, send and inbox read. Withdrawn/expired reports disappear from the inbox.
- Policy announcements are created in the admin Policy announcements screen.
  Each needs a current official source, HTTPS evidence on the source domain,
  effective/expiry dates and two independent reviewers. Editors cannot self-approve.
  Publication, revisions, reverts and withdrawal use the existing audit workflow;
  a DB trigger and filtered view enforce review even outside the HTTP endpoint.
- Anonymous installation credentials expire after90days and are separate from
  driver/admin identities. A successful opt-in grants a24-hour lease, refreshed
  while the already-authorized app is foregrounded. Permission revocation/master
  off disables remote consent on the next successful sync. Offline changes cannot
  instantly recall an already accepted push; the lease bounds further delivery.
- Closures and policies share a per-token cap of1or2/day (user choice), six/rolling
  seven days. Quiet time21:00–08:00 Africa/Accra defers until08:00 if still current.
  Local renewal reminders have their own separate caps; combined maxima can exceed
  two/day. No hidden marketing messages use either allowance.
- A unique event key prevents repeat sends for the same closure or policy revision.
  Token-wide advisory locks serialize cap reservations across workers. Only explicit
  rate-limit rejections retry, maxfive attempts with bounded exponential delay.
  Timeouts, ambiguous HTTP5xx and stale processing claims become `unknown` and are
  not blindly resent. Receipts are checked after15minutes. Invalid tokens are revoked.
- Generic push text contains no saved-place name or location. Channels are quiet;
  foreground banners/sound are suppressed while navigating/moving. OS/background
  presentation cannot be fully controlled by JS; users can disable channels in phone
  settings. Taps never accept an arbitrary URL and never interrupt active navigation.
- Erase removes installation, regions, queue and encrypted token. Anonymous token
  fingerprint reservations remain for at most8days to prevent reinstall cap bypass.
  Worker purges queue7days afterexpiry and inactive registrations after30days.

## Verification

Automated tests exercise Accra scheduling across host time zones, invalid/leap dates,
past reminders, opt-out, denied permission, partial scheduling rollback, encrypted
token tampering, strict no-marketing/no-trip schemas, ownership isolation, rounded
regions, independent policy reviews, quiet hours, daily/weekly caps, expiry,
withdrawal, duplicate queue entries and receipts using a fake transport only.

Physical acceptance remains pending: Android13+ permission denial/revocation,
notifications disabled per channel, background/cold launch, timezone change, reboot,
battery saver, offline opt-out/deletion and actual FCM delivery. Verify that navigation
voice remains uninterrupted. No test sent a real push to users.
