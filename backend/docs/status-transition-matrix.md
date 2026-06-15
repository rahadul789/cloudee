# Status Transition Matrix

## 1. Restaurant Lifecycle

| Current | Actor | Next | Notes |
|---|---|---|---|
| `account_created` | system after OTP verify | `phone_verified` | First successful owner phone verification |
| `phone_verified` | owner | `onboarding_in_progress` | First meaningful draft save/update |
| `onboarding_in_progress` | owner | `submitted` | Submit onboarding snapshot |
| `submitted` | admin | `under_review` | Review queue picked up |
| `under_review` | admin | `approved` | Dashboard unlocked |
| `under_review` | admin | `rejected` | Owner must fix and resubmit |
| `rejected` | owner | `submitted` | Resubmission creates next review cycle |

### Final Rule
- Only admin can set `under_review`, `approved`, or `rejected`
- Owner never changes approval statuses directly

## 2. Owner Phone Verification

| State | Actor | Result |
|---|---|---|
| verified phone unchanged | owner | no OTP needed |
| owner changes phone | owner | `pendingPhone` created |
| `pendingPhone` verified | system | `phone = pendingPhone`, `pendingPhone = null` |

## 3. Payout Method Verification

| Condition | Result |
|---|---|
| bKash number matches owner phone | verified immediately |
| bKash number differs from owner phone | create `pendingAccountNumber`, OTP required |
| OTP success | active payout number updated |
| OTP not completed | active payout number stays unchanged |

## 4. Order Status

### Canonical Statuses
- `New`
- `Accepted`
- `Preparing`
- `ReadyForPickup`
- `PickedUp`
- `Delivered`
- `Rejected`
- `Cancelled`

### Allowed Transitions

| Current | Actor | Next | Final Rule |
|---|---|---|---|
| `New` | owner | `Accepted` | restaurant accepted |
| `New` | owner | `Rejected` | restaurant rejected |
| `New` | customer/system | `Cancelled` | allowed before acceptance timeout/business rule |
| `Accepted` | owner | `Preparing` | restaurant started preparing |
| `Accepted` | customer/system | `Cancelled` | only if cancellation window still open |
| `Preparing` | owner | `ReadyForPickup` | food ready |
| `Preparing` | system | `Cancelled` | exceptional failure only |
| `ReadyForPickup` | rider | `PickedUp` | rider collected order |
| `ReadyForPickup` | system | `Cancelled` | exceptional failure only |
| `PickedUp` | system | `Delivered` | delivery complete |

### Terminal Statuses
- `Delivered`
- `Rejected`
- `Cancelled`

### Required Terminal Metadata
- `terminalReason`
- `cancelledBy`
- `rejectionReason`

## 5. Live Orders vs History

| Group | Statuses |
|---|---|
| Live | `New`, `Accepted`, `Preparing`, `ReadyForPickup`, `PickedUp` |
| History | `Delivered`, `Rejected`, `Cancelled` |

## 6. Voucher Lifecycle

### Authoring Status
- `Draft`
- `Active`

### Runtime Lifecycle
- `Draft`
- `Scheduled`
- `Active`
- `Expired`

### Resolution Rules
- Higher `priority` resolves first
- `exclusive` cannot stack
- `stackable` may stack only if future checkout rules allow it
- final resolved discount must be snapshotted into order redemption record

## 7. Payout Batch Status

| Current | Actor | Next |
|---|---|---|
| `pending` | system/admin | `processing` |
| `processing` | system | `completed` |
| `processing` | system | `failed` |

## 8. Ledger Settlement Status

| Current | Next | Meaning |
|---|---|---|
| `pending` | `available` | settlement delay passed |
| `available` | `paid_out` | included in payout batch |

## 9. Support Case Status

| Current | Actor | Next |
|---|---|---|
| `open` | admin/support | `in_progress` |
| `in_progress` | admin/support | `resolved` |
| `resolved` | admin/system | `closed` |

## 10. Notification Read State

| Current | Actor | Next |
|---|---|---|
| `unread` | owner | `read` |

### Final Rule
- Notification read state never changes the source entity state
- Notifications are projections of domain events, not business state owners

## 11. Restaurant Discovery Visibility

| Condition | Result |
|---|---|
| `approved = false` | hidden from customer app |
| `isOnline = false` | hidden from customer app |
| outside valid opening window | hidden from customer app |
| temporary closure active | hidden from customer app |
| all checks pass | visible in customer app |

### Final Rule
- online alone is not enough
- approved + online + currently open is required for visibility

## 12. Featured and Offer Collections

| Collection | Ownership | Rule |
|---|---|---|
| `featured_restaurants` | admin | static list with explicit sort order |
| `restaurants_with_offers` | system/admin | dynamic from active promotions/vouchers |

### Final Rule
- a restaurant can be featured without an active offer
- a restaurant can be in offers collection without being featured
- featured rank must be stable and explicitly sortable
