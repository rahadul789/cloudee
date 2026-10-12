# Delivery live tracking audit

Date: 2026-10-12 (Asia/Dhaka).

Result: local code, regression, HTTP/socket integration and build checks passed.
Physical-phone GPS tests, authenticated browser UI verification and Docker/VPS
runtime checks remain unverified. No deployment was performed.

Latest release scope: backend, rider app and admin-web. The user froze customer-app
after its Play Store release. Earlier unreleased customer changes and generated
test artifacts were restored/removed; git diff and status for customer-app are
clean. No customer source/install/update is required for the backend compatibility
fixes below.

## Follow-up fixes for the existing Play Store client

- REST order details and location socket payloads now put buffered delivery time
  into the existing routeToCustomer.durationMinutes numeric field. Pure travel
  duration is retained separately as travelDurationMinutes; cached routing data
  is not mutated and no second buffer is added by the server adapter.
- Admin handoff buffer configuration is shared by REST and socket calculation,
  tapering near the destination. The existing client keeps its numeric ETA UI;
  estimated ranges/updating labels need a future customer release and are outside
  this release scope.
- Haversine fallback is sent as an explicit route object with an empty polyline.
  This prevents the legacy client's null-coalescing merge from retaining an old
  Google route alongside a newer rider location.
- Authenticated rider/customer sockets automatically recover their own room on
  connection, supporting older clients that miss an explicit join event.
- Rider foreground reconciliation detects a native GPS stream with no samples for
  60 seconds. It suspends that stream without losing the trip, uses the foreground
  fallback and waits 90 seconds before retrying native tracking.
- The rider home map disables its native location listener during picked-up
  deliveries (and initial loading), using server-tracked rider coordinates while
  the location service owns GPS sampling.

Device diagnosis: an authorized Samsung SM-M336BU was connected, with fine,
coarse, background, foreground-service and notification permissions granted.
The installed rider app opened successfully and showed the online/waiting state
with no active delivery. USB subsequently disconnected. A test order was requested
for pickup/lock testing. The new APK has not yet been installed/tested at this
checkpoint; only the old app's startup/permissions were inspected. The final
arm64 test APK successfully built after the home-map fix and is available at
../delivery-app/android/app/build/outputs/apk/release/app-release.apk (approximately
41.8 MB). It uses the project's local debug signing configuration and is a test
artifact, not a Play Store publishing artifact.

## Fixes found during this audit

1. Native GPS metadata can use -1 for unavailable heading/accuracy/speed. These
   values previously rejected valid coordinates at the rider location endpoint.
   Rider payloads now omit unavailable metadata. The backend also accepts the
   known native sentinel values from older installed clients while retaining
   coordinate validation.
2. Admin socket rooms were not restored after reconnect/token refresh. Active
   scopes now rejoin on every successful connection, and leave when the page exits.
3. Admin markers depended on queued delivery route work completing. Saving a
   rider profile location now independently invalidates the admin snapshot and
   emits a live-map refresh signal.
4. A delayed queued location write could overwrite a newer rider profile location.
   Queued writes now preserve receipt time and refuse to replace newer data.
5. With multiple picked-up orders, the admin rider summary could point at the
   first order rather than the focused trip. It now prefers activeTrackingOrderId.
6. An in-flight pre-update cache load could overwrite a newer snapshot after
   invalidation. Load completion now checks entry identity before caching.
   Regression tests reproduced the old failure and passed after the fix.
7. iOS credentials defaulted to a keychain accessibility that prevents reads while
   locked. New writes use AFTER_FIRST_UNLOCK, and old persisted rider auth is
   migrated once while the app is active before starting background tracking.

The earlier lifecycle, foreground fallback, stationary sampling, latest-coordinate
recovery, customer stale polling and buffered ETA changes were also reviewed.

## Verification evidence

| Check | Result | Scope |
| --- | --- | --- |
| Backend Jest suite | 73 tests, 13 suites passed | Includes legacy ETA compatibility, automatic own-room recovery, location schema, real HTTP routing with mocked sessions/service, real local WebSocket transport/room guards, location queue/admin snapshot with mocked models, and cache races |
| Rider regression suite | 13 passed | Native metadata, heartbeat, single-flight uploads, offline recovery, reopen/completion, fallback, stalled-stream recovery/cooldown, iOS auth migration/accessibility |
| Earlier customer ETA suite | 6 previously passed; excluded from current release | Customer files frozen; client UI changes are not being released |
| Admin socket regression suite | 2 passed | Network/token reconnect room restoration and leaving a scope |
| Admin smoke script | Passed | Existing auth/socket configuration smoke checks |
| TypeScript | Passed for backend, admin-web, delivery-app and customer-app | Source/type checks; admin uses tsc -b |
| Backend production compile | Passed | Same TypeScript compile used by Dockerfile |
| Admin Vite production build | Passed | Generated dist, including live-map chunk |
| Earlier Android JS exports | Passed before customer freeze | Customer export removed; existing customer Play Store release is unchanged |
| Final rider arm64 APK | Build passed | Android release/native compile, merged manifest, lintVital and packaging completed; not installed after USB disconnect |
| Changed tracking code lint | No errors | Seven pre-existing backend customer-service warnings and twelve pre-existing rider home-map warnings; customer-app is unchanged |
| Diff whitespace check | Passed | No whitespace errors |

No test in this audit wrote to production MongoDB. Database interactions in the
tracking pipeline tests use mocked models; real database persistence remains a
release environment check.

## Admin /live-map behavior reviewed

- Rider markers use rider.lastKnownLocation, serialized as currentLocation with
  lastUpdatedAt; delivery markers reference the same rider profile location.
- Selected rider/delivery details reconcile with updated snapshots.
- Location events request a snapshot refresh, throttled to 10 seconds; the default
  polling fallback is 30 seconds. Polling can be disabled through admin preferences.
- Rider positions older than two minutes are marked stale.
- The map draws direct rider-to-target/context connector lines. These are not
  Google road-navigation polylines. Google navigation opens through the existing
  external directions action.
- Existing snapshot limits remain: 100 riders, 100 delivery cards, 250 restaurants.

## Docker/VPS configuration reviewed

- Compose defines one backend instance. Its in-memory queues, caches and Socket.IO
  adapter fit this configuration; horizontal replicas would need shared socket
  fan-out and coordination before being enabled.
- Caddy routes /api/* and /socket.io/* to backend:5000 on the admin domain and
  routes the API domain directly to the backend. This is a configuration review,
  not a test of the running VPS proxy.
- Admin's Docker build uses VITE_API_BASE_URL=/api/v1 and serves the SPA through
  Nginx. Mobile production builds specify https://api.foodbela.com/api/v1.
- Location PATCH requests have their own rider limiter and are exempt from the
  general API limiter. Token refresh has single-flight/backoff behavior in the app.
- Docker was unavailable in this workspace, so compose validation/image builds and
  container health/WebSocket proxy checks were not run.

## Remaining release checks

1. Run the updated rider release with the existing Play Store customer app on physical phones with one focused delivery.
   Move with the rider app open, then lock it and keep moving for several minutes.
   Verify rider.lastKnownLocation, the focused order's riderTracking timestamp,
   customer marker/ETA and admin marker all advance.
2. Test poor network, offline/reconnect, app reopen and token expiry. Confirm there
   are no persistent 400/401/429 location responses. Device diagnostics are tagged
   [rider-tracking]; do not include credentials or exact coordinates in reports.
3. Test two picked-up orders, focus switch and delivery completion. The focused
   customer should track; queued customers should see queue state. Verify admin
   shows the correct active trip and tracking stops once all deliveries end.
4. Verify the admin page in an authenticated browser: marker movement, selected
   details, reconnect after network loss/token refresh, filters and stale labels.
   Browser automation initialization failed before page access in this session;
   no visual screenshots or UI signoff are claimed.
5. In a Docker-capable release environment, validate compose without dumping
   resolved secrets, build backend/admin images and test readiness plus authenticated
   WebSocket traffic through Caddy. Distribute the updated rider release too;
   the customer Play Store app remains unchanged.
6. Watch battery use/responsiveness after stationary sampling changes. OS/OEM force
   termination and Android force-stop still impose platform limitations.

See ../delivery-app/docs/live-tracking-release-check.md for the physical-device
scenario checklist. Deploy after the remaining release checks have evidence.
