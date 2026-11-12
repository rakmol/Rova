# Optional driver accounts, saved places and privacy

## Current activation state

The owner has supplied the ROVA Supabase credentials privately. The project accepted
the publishable key and the admin credential in read-only checks; email auth is enabled.
The API has been restarted and both local and phone-tunnel status report sign-in enabled.
**Live email delivery, the OTP email template, and a real end-to-end sign-in still need
verification.** No email was sent and no provider account was created by these checks.
Guest navigation, local Home/Work/favorites, settings, permission explanation and local
deletion continue to work without signing in. No paid plan was activated.

## Provider integration

Uses the maintained server-side `@supabase/supabase-js` SDK for passwordless email OTP,
verification, token refresh, user validation, global sign-out and provider account deletion.
Each public auth operation creates a stateless client: no shared user's refresh session
can leak between requests. The admin client never signs in as a driver. API identity is
verified via `auth.getUser(jwt)` against the configured project, never decoded/trusted
from unsigned JWT claims. A verified email is required. Identity keys include the provider
issuer, preventing a project change from matching a coincidentally identical subject UUID.

Official references:
[email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[server-validated user](https://supabase.com/docs/reference/javascript/auth-getuser),
[provider deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

Later setup, all in private `apps/api/.env`:

```
SUPABASE_URL=https://YOUR-ROVA-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-project-publishable-or-anon-key
SUPABASE_SECRET_KEY=your-project-secret-or-service-role-key
```

All three are required before sign-in enables, so account creation cannot be enabled
without a deletion credential. No Supabase keys go into Expo, browser bundles or chat.
Configure email auth and customize the email template to display `{{ .Token }}` as a
6-8 digit code. Configure/verify an email sender and provider limits for public users;
default project email delivery may be restricted. Review current provider costs and
limits before release. No magic-link callback/redirect is used; users type the email code.
Test live email delivery, refresh, sign-out and deletion with a disposable real account
after activation; mock-provider tests do not establish those production flows.

Apply migration009 with `npm run db:migrate --workspace @rova/api`. New account tables
are not granted to public clients; saved-place/preferences tables enable RLS with no
client policies. The managed server DB login must be authorized for these private tables;
the local development connection owns the schema. Never distribute DB/service credentials.
The API enforces owner scoping even though its service connection can access all drivers.

## API

* `GET /v1/auth/status` -> `{enabled,guestNavigation:true,provider}`. No authentication.
* `POST /v1/auth/code` `{email}` -> generic eligible-request message;3/IP/hour.
* `POST /v1/auth/verify` `{email,code}` -> `{accessToken,refreshToken,expiresAt}` (Unix ms);
 8/IP/15min. Provider rate limits apply as well.
* `POST /v1/auth/refresh` `{refreshToken}` -> rotated session;10/IP/minute.
* `POST /v1/auth/sign-out` with driver bearer -> revoke provider refresh sessions globally.
 Already issued JWTs may remain valid until expiry; use short provider access-token TTLs.
* `GET /v1/me` with driver bearer -> `{id,role:'driver',places,preferences}`.
* `POST /v1/me/sync` with bearer `{places,preferences}` -> atomically replaces only the
 caller's cloud copy.6/IP/minute,64KiB maximum,50 places, unique client keys and one
 Home/Work each. A second owner's data cannot be selected via request parameters.
* `POST /v1/me/erase-data` -> erase cloud saved places/preferences; account remains active.
* `POST /v1/me/delete-account` `{confirm:'DELETE'}` -> 200 when provider deletion completes,
 or202 when queued. The local account is blocked and local cloud data erased first.
* `POST /v1/incidents/erase-device` uses the **separate anonymous reporting bearer**:
 deletes its notes/votes/device links/session; public hazard facts may remain anonymously.

Place: `{clientKey,kind:'home'|'work'|'favorite',label,address,attribution,lon,lat}`.
Preference: `{voiceEnabled,voiceLanguage:'en-GH'|'en-GB'|'en-US',units:'metric'|'imperial'}`.
WGS84 bounds, labels/lengths and unknown fields are validated. There is no client role,
driver admin endpoint, route/history field or automatic GPS coordinate upload for sync.
All account requests use HTTPS except local loopback; auth tokens use headers/bodies,
never URL query strings. Logs omit request bodies, query coordinates, email and tokens.
Missing provider credentials return503 on auth operations; guest health/navigation stays up.

Normal driver identity is always `driver`, even if user metadata asks for `admin`.
Moderator/import routes continue to require their separate private operator credentials.
Driver sign-in never grants official-data approval, moderation or developer privileges.

## Phone behavior and storage

No login gate is added to routing or navigation. Settings offers optional email code sign-in.
Tokens/refresh tokens stay in memory only; restart returns to guest. No new native auth
dependency or APK is required. Refresh is serialized before account calls and old login
responses cannot undo sign-out. Tokens are not persisted to ordinary filesystem storage.
There is no offline queue/retry for account mutation/deletion: users receive explicit errors.

Guest saved places/preferences use the phone's private application document directory,
in `rova-driver-data.json`. They are explicitly selected destinations, not inferred Home
from GPS. This is OS-sandboxed ordinary app storage, **not an encrypted vault**; device
backup/rooted-device access can expose it. Users can remove places or erase it from Settings.
Only supported fields are serialized; no raw routes, continuous locations or credentials.
Device backup retention/removal is controlled by the OS/user, not guaranteed by an app wipe.
Only save licensed provider results: Geoapify, or Mapbox when permanent mode is configured.
Provider attribution stays with saved places; temporary Mapbox geocoding is not bookmarked.

Manual Home/Work saves replace the previous entry; favorites are bounded to50 total places.
Saved entries open the normal destination/map route flow, including fresh-location checks.
Sync is off by default and manual per action. Back up replaces the account copy only after
confirmation. Loading replaces phone places/preferences after confirmation and marks those
places account-owned; sign-out removes downloaded account places. Locally created guest
places remain until explicitly cleared. No automatic guest-to-account merge or background sync.
Sign-in alone does not upload anything. Cloud copies require separate erase/delete actions.

Voice choices are English locale/accent preferences, subject to installed device voices;
this does not translate English route instructions into other languages. Unit preferences
change travel distances, turn-distance prompts and GPS speed display. Legal speed-limit
data/compliance calculations remain km/h and are labelled/spoken as such. Voice off stops
future prompts; per-journey mute remains independent. Foreground permission status is read
without prompting, and Settings explains use and opens system controls for grant/revoke.
Search history remains opt-in, bounded to10 locally typed queries, and can be cleared or
disabled. Clear also removes in-memory provider caches. Clearing phone data removes local
places/preferences/history and current route context. Account deletion also clears phone
places/preferences/searches. Anonymous reporting deletion is explicitly separate because
anonymous report identities are never silently linked to driver accounts.

## Deletion reliability and retention

Account deletion locks/blocks the local users row, deletes cloud saved places/preferences,
detaches linked device/report/user references, and enqueues a private provider deletion job
in the same transaction. Concurrent sync rechecks that row under lock, so it cannot restore
data after deletion. Provider errors never restore the account. The client reports queued
provider deletion honestly instead of claiming complete erasure. An immutable anonymous
status/tombstone is retained to reject old still-valid tokens while provider deletion retries.

Schedule `npm run accounts:maintenance --workspace @rova/api` on the deployed server,
e.g.every5minutes. It retries at most100 due jobs/run, exponentially backs off1minute up to
1hour, treats provider404 as success, and processes only the configured provider issuer.
Completed deletion tombstones/jobs are removed after30days. Pending jobs remain private
until resolved. Existing safety audit/status rows can remain without email/saved-place data.
The repository supplies the job; provisioning a hosted scheduler is part of deployment.
Provider infrastructure backups have their own retention and cannot be instantly wiped
by this API. Device anonymous reporting retention remains documented in INCIDENTS.md.

## Tests

Real PostGIS integration tests exercise owner isolation, forged tokens, metadata escalation
rejection, driver-vs-moderator separation, data erasure, deletion outage/queue/retry and
blocking subsequent sync. Mobile tests cover guest save/navigate/remove, serialized local
clear, no route/credential persistence, unit conversions, token-in-header only, and late
login responses after sign-out. Live provider testing remains deferred until project setup.
