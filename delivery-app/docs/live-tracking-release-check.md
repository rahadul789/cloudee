# Live tracking release verification

Local regression checks:

```powershell
# From delivery-app
node --test scripts/test-rider-tracking.cjs
node node_modules/typescript/bin/tsc --noEmit
```

Also run the TypeScript check from customer-app. The automated tests mock native
location and networking; they do not prove Android/iOS background delivery.

Test the updated rider and customer release builds together on physical phones:

1. Pick up a single order and move outdoors with the rider app open. Confirm
   PATCH /api/v1/rider/profile/location succeeds and the order's
   riderTracking.lastUpdatedAt and customer marker advance.
2. Keep the rider stationary for at least a minute. Confirm accepted fresh fixes
   continue to upload at the configured heartbeat (subject to OS scheduling).
3. Lock the rider phone for several minutes, continue moving, then reopen it.
   Confirm tracking survives and does not disappear while orders reload.
4. Disconnect rider data, move, and reconnect. Confirm the latest coordinate is
   uploaded without replaying the old queued position as a fresh update.
5. Keep the customer socket connected but suppress rider events in a controlled
   test environment. With an old tracking timestamp, the customer should fetch
   details on the next 25-second poll after 45 seconds of staleness.
6. Deliver the order. Confirm the rider native service/fallback stops. Repeat
   with a second picked-up order: it should continue tracking after promotion.
   Only the focused trip shows live tracking; other trips remain queued by design.
7. Repeat across access-token expiry and a temporary failed orders request.
   Check rider device logs tagged [rider-tracking] and API response status codes.

Use no credentials or exact coordinates in diagnostic reports. Console warnings
are rate limited; they are device diagnostics, not a centralized monitoring service.
Android force-stop and OS/OEM process termination remain platform limitations.

No deployment is performed by these code changes. Both apps need the updated
JavaScript release on the appropriate compatible runtime/channel, or new builds.
Watch battery use and responsiveness on real phones because native sampling now
continues while stationary; uploads remain throttled and single-flight.
