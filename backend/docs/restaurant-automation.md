# Restaurant availability automation

Existing restaurants remain in `manual` mode. No customer-app update or environment variable is required. Deploy backend, admin-web and restaurant-owner-web together. The backend starts a reconciliation cycle after MongoDB connects, then every 15 seconds.

## Controls

- Owner web: Opening hours → Automatic opening and closing → Save Changes.
- Admin web: Restaurants → restaurant actions → Opening hours / Auto mode.
- Owner API: `GET /owner/opening-hours`, `PUT /owner/opening-hours`.
- Admin API: `GET /admin/restaurants/:restaurantId/opening-hours` returns `{ hours, history }`; `PUT` accepts the same schedule fields as the owner endpoint. Existing admin authentication and area checks apply.

Example PUT payload:

```json
{
  "automationMode": "auto",
  "timezone": "Asia/Dhaka",
  "weeklySchedule": [
    { "day": "monday", "isOpen": true, "is24Hours": false,
      "timeSlots": [{ "startTime": "14:00", "endTime": "21:30" }] }
  ]
}
```

Missing weekdays are closed. Supply all seven days for a daily schedule. Open days require valid, non-overlapping slots; invalid schedules cannot enable auto mode. Equal opening/closing times mean a 24-hour shift. End times earlier than start times carry into the following day. A weekly day off permits the preceding overnight shift to finish; a date exception replaces the entire calendar date, including that carry. Special-date exceptions have priority over weekly hours. Reopening predictions scan the following week; unknown openings have no countdown.

## Policy

Auto mode ignores the stored online flag when deciding whether orders may be placed. It requires restaurant hours and effective platform/zone service hours to overlap, with no active owner pause, admin hold, or enforcement restriction. Platform service-hour overrides retain their existing inheritance rules. All schedule times use Asia/Dhaka.

Owner status off pauses until the next scheduled opening (next midnight for a continuous 24-hour schedule). Owner status on clears that owner pause and resumes the schedule; it cannot open outside service hours or bypass an admin hold. Admin status off establishes a separate hold with no expiry. Admin status on clears the admin hold; owner pauses and schedule restrictions still apply. Switching modes does not clear an admin hold.

`temporaryClosure` supports timed (`hours`, with ISO `resumeAt`), `fullDay`, `shift`, and `indefinite` pauses. Explicit `resumeAt: null` removes the expiry. `isPaused: false` resumes the schedule. Owner web provides 30/60-minute and indefinite pause controls, applied when saved. The live status toggle applies the shift pause immediately.

## Reliability and order handling

The cart check runs outside the pricing cache, and order creation checks availability again immediately before writing the order. Discovery and restaurant details re-evaluate availability outside response caches. An already open customer screen still follows its existing refresh behavior.

Reconciliation maintains the existing runtime flags, availability sessions, cache invalidation and owner/restaurant socket events. Per-restaurant MongoDB leases prevent duplicate concurrent workers; leases expire after 60 seconds following a crash. Runtime writes use an updatedAt comparison to avoid overwriting concurrent restaurant updates. Failed jobs are logged and retried on later cycles. API validation remains authoritative when a worker is delayed. Dashboard runtime flags normally follow within 15 seconds, subject to database availability.

Closing blocks new orders and does not cancel accepted orders or change their preparation/handover flow. Scheduled closures use the `scheduled_close` session end reason and are excluded from offline-with-live-orders risk counts and routine critical alerts. Actual order delay monitoring remains active. Automatic transitions are retained in `restaurantautomationhistories`; the admin endpoint exposes the latest 100.

A bKash checkout confirmed after closing still passes through the order availability guard. If the gateway has already collected payment, the existing paid-without-order failure tracking and admin alert flow handles the failed finalization. This change does not introduce automatic refunds or a payment reservation system; include this boundary case in the live rollout smoke test.

## Rollout / rollback

Verify one restaurant's seven-day schedule and exceptions, then enable auto mode for that restaurant. Check the opening, closing, pause/resume and admin hold behavior before wider rollout. To roll back a restaurant, select Manual and save, then set its online status explicitly. No restaurants are automatically enrolled or modified by deploying this feature. New collections and schema defaults are created by the normal Mongoose model initialization.

Tests cover time boundaries, intersecting hours, pauses, overnight carry, exceptions, split shifts, restrictions, legacy manual behavior and malformed schedules. A live MongoDB/deployment smoke test and browser verification remain necessary before production rollout.
