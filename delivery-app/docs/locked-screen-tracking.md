# Locked-screen tracking release checks

The rider app uses Expo Location's native Android location foreground service, not
a JavaScript timer or an open Socket.IO connection, to capture and upload fixes
while the screen is locked. Native-task tests simulate background state; they do
not certify a particular handset or OEM power-management setting.

## Release order

1. Deploy the backend first. `recordedAt` is optional, so older rider apps remain
   compatible. New clients send the GPS sample time; late samples cannot overwrite
   a newer stored rider point.
2. Build and install the updated Rider APK. The app config explicitly enables the
   Android location foreground service and background location. Verify the build
   includes its location service notification and permissions.
3. Update the customer app for stale-location labels and connected-but-silent
   socket recovery. Deploy admin web if applying the changed tracking presets.

## Physical-device acceptance test — not yet run

Use at least one phone of each model used by the rider fleet. During a test, enable
GPS, **Use precise location**, **Allow all the time**, and mobile data. If that OEM
restricts the app's service, set its app battery policy to **Unrestricted**.

| Scenario | Required result |
| --- | --- |
| Go online without a pickup | Admin rider marker updates; dispatch has recent coordinates. |
| Deny background or precise location, then tap Pickup | Pickup is not committed; the rider gets an actionable permission message. A missing/low-quality first GPS fix also requires retrying before pickup. |
| Pickup with permissions granted | Foreground service is running before pickup completes; the first real location reaches the customer. |
| Lock the screen immediately after Pickup and move for 15–30 minutes | Service notification remains; customer/admin sample times and coordinates advance. Target active cadence is 15–30 seconds; OS scheduling is not an exact deadline. |
| Stay stationary with the screen locked for five minutes | Heartbeats continue using new GPS samples; an old cached coordinate is not relabeled live. |
| Disable mobile data for two minutes, move, then reconnect while locked | The newest accepted sample uploads after connectivity returns; an old queued coordinate does not replace it. |
| Keep the screen locked through access-token expiry | A single refresh recovers uploads; transient proactive-refresh failure can still use the unexpired access token. |
| Swipe away from recents | Check actual OEM behavior. The configured service does not request shutdown on task removal; Android/vendor termination may still stop it. |
| Force-stop in Android Settings, or turn off GPS/data | Live tracking is not guaranteed. Customer/admin must show missing/stale information, never invented movement. Reopen the app and verify recovery. |
| Complete delivery, then go offline | Native service stops once no delivery is active. |
| Customer socket stays connected but receives no positions | A missing or >45-second-old focused-trip sample triggers REST recovery. |

Compare **GPS sample timestamps**, not only the displayed pin. Admin freshness uses
the rider profile timestamp; customer freshness uses the active order's tracking
timestamp. Screens label positions older than two minutes as stale.

## Automated checks

From `delivery-app`: `node scripts/test-rider-tracking.cjs`.

From `backend`: run `rider-tracking-pipeline`, `rider-location-endpoint`,
`rider-location`, `tracking-cache-invalidation`, and `tracking-socket` Jest suites.

From `customer-app`: run `src/lib/tracking-freshness.test.ts` with Jest.

Typecheck backend, rider, customer, and admin projects before release.
