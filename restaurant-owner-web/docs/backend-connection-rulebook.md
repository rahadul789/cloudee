# Backend Connection Rulebook

This document defines the frontend system behavior that should be treated as the product source of truth before backend development starts.

## 1. Product Lifecycle

### Owner Account Status
- `account_created`
  Phone/password account exists, but phone is not verified yet.
- `phone_verified`
  Owner phone is verified, but onboarding has not started meaningfully yet.
- `onboarding_in_progress`
  Owner is filling onboarding draft data.
- `submitted`
  Onboarding snapshot was submitted and is waiting to enter admin review.
- `under_review`
  Admin is actively reviewing the submitted snapshot.
- `approved`
  Restaurant is approved and dashboard access is unlocked.
- `rejected`
  Admin returned the application with notes and section-wise issues.

### Access Rules
- Authenticated but not approved owners must not access dashboard routes.
- `approved` owners can access dashboard routes.
- `submitted`, `under_review`, and `rejected` owners go to `/review-status`.
- `account_created`, `phone_verified`, and `onboarding_in_progress` owners go to `/onboarding`.

## 2. Auth Rules

### Sign Up
- Required fields:
  - full name
  - phone number
  - password
  - confirm password
- Email is not part of signup.
- Signup creates the owner account and opens OTP verification.
- Successful OTP verification moves lifecycle to `phone_verified`.

### Sign In
- Identifier is phone number only.
- Sign in does not require OTP.
- Successful sign in navigates to `/`, then route guards decide the final allowed screen.

### Phone Change
- Phone change is a sensitive update.
- New phone is stored in `pendingPhone`.
- Old verified phone remains active until OTP verification succeeds.
- Only after OTP success:
  - `phone = pendingPhone`
  - `pendingPhone = ""`
- No owner/store data should be lost during phone change.

## 3. Onboarding Rules

### Required Steps
- `basic_info`
- `location`
- `hours`
- `payout_setup`
- `review_submit`

### Draft Rules
- Onboarding saves draft data.
- Draft data should be treated as an application snapshot, not live approved restaurant data.
- Submitting onboarding must preserve a `submittedAt` timestamp.

### Review Rules
- Owner can view review status.
- Owner cannot approve, reject, or move review states manually.
- Rejected applications must contain:
  - section id
  - title
  - field list
  - admin note

## 4. Store Profile Completion

Completion is weighted to total `100`.

- Basic Info: `20`
- Contact Info: `15`
- Address: `15`
- Logo: `10`
- Cover Image: `10`
- Opening Hours: `15`
- Payout Setup: `15`

### Completion Rule
- Before approval, completion should reflect onboarding/store profile draft.
- After approval, completion should reflect live restaurant profile data.

## 5. Store Runtime Rules

Store operational state must follow this priority:

1. Restaurant approved?
2. Owner online?
3. Temporary closure active?
4. Exception for today?
5. Weekly opening-hours slot?

### Final Rule
- If any earlier check fails, store is closed.
- Daily exception overrides weekly schedule.
- Temporary closure overrides everything except approval state.

## 6. Catalog Rules

### Categories
- Category name should be unique per restaurant.
- Category delete should be soft delete or blocked if linked menu items exist.
- Recommended future status:
  - `active`
  - `archived`

### Menu Items
- Menu item identity must be stable by id, not by display name.
- Menu item state should distinguish:
  - active
  - available
  - archived/hidden
- Orders must store immutable item snapshots.

### Variants and Add-ons
- Variant and add-on ids must be stable.
- Modifier groups need explicit:
  - `required`
  - min selection
  - max selection
- Order records must preserve chosen variants/add-ons and final price snapshot.

## 7. Orders Rules

### Canonical Statuses
- `New`
- `Accepted`
- `Preparing`
- `ReadyForPickup`
- `PickedUp`
- `Delivered`
- `Rejected`
- `Cancelled`

### Actor Ownership
- Owner:
  - `New -> Accepted`
  - `New -> Rejected`
  - `Accepted -> Preparing`
  - `Preparing -> ReadyForPickup`
- Rider:
  - `ReadyForPickup -> PickedUp`
- System:
  - `PickedUp -> Delivered`
  - can cancel in allowed pre-terminal stages
- Customer:
  - can cancel only in allowed early stages

### Live vs History
- Live orders:
  - `New`
  - `Accepted`
  - `Preparing`
  - `ReadyForPickup`
  - `PickedUp`
- History orders:
  - `Delivered`
  - `Rejected`
  - `Cancelled`

### Required Future Fields
- `cancelledBy`
- `terminalReason`
- `rejectionReason`
- `paymentStatus`

## 8. Notifications Rules

Notifications must be event-derived, not just UI cards.

### Required Fields
- `id`
- `type`
- `eventType`
- `entityType`
- `entityId`
- `title`
- `description`
- `createdAt`
- `read`
- `actionPath`

### Example Event Types
- `order.created`
- `order.accepted`
- `order.rejected`
- `order.delivered`
- `payout.completed`
- `voucher.activated`
- `review.created`
- `support.updated`

## 9. Promotions and Voucher Rules

### Voucher Metadata
- `createdByType`
- `createdById`
- `fundedBy`
- `stackingRule`
- `priority`

### Final Business Rules
- Priority resolves which promotion wins first.
- Stacking must be explicit:
  - `exclusive`
  - `stackable`
- Voucher redemption must be snapshotted on the order.
- Backend should later add:
  - `exclusiveWith`
  - `fundingSplit`
  - `resolvedDiscountBreakdown`

## 10. Payout and Finance Rules

Current UI supports:
- payout method
- available balance
- pending balance
- payout history
- payout transactions

### Final Backend Rule
Finance must not rely only on page-level summaries.

Backend-facing concepts should be:
- `ledgerEntry`
- `settlementStatus`
- `payoutBatch`
- `availableAt`
- `adjustmentType`
- `sourceEntityType`

### Sensitive Payout Rule
- If bKash number equals owner phone, it is considered verified.
- If bKash number differs from owner phone:
  - new number stays pending
  - active payout method does not change until OTP succeeds

## 11. Analytics Rules

Analytics must use shared formulas only.

### Must Be Locked Before Backend
- total revenue
- net earnings
- average order value
- repeat customers
- completed orders
- pending orders
- payout available/pending values
- voucher impact

### Rule
- Frontend and backend must use the same formula definitions.
- No page should invent its own calculation.

## 12. Support Rules

User-facing term:
- `Report Issue`

Backend entity:
- `support_case`

### Statuses
- `open`
- `in_progress`
- `resolved`
- `closed`

### Required Future Fields
- `createdByOwnerId`
- `assignedAdminId`
- `messages`
- `lastUpdatedAt`
- `resolutionNote`

## 13. Domain Separation Required

These domains should be separated before backend starts:

- `ownerAccount`
- `onboardingDraft`
- `restaurantProfile`
- `restaurantApproval`
- `storeRuntime`
- `catalog`
- `orders`
- `notifications`
- `reviews`
- `vouchers`
- `finance`
- `supportCases`

## 14. Critical Non-Negotiable Rules

- Owner must never self-approve onboarding.
- Dashboard access must never unlock before `approved`.
- Sensitive phone and payout updates must never go live before verification.
- Live and history orders must follow one shared rule everywhere.
- Notification records must be traceable to real entity events.
- Finance must move toward ledger-based backend contracts.
