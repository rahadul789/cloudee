# Entity Relationship and Data Model

## Core Architecture

The backend should use one shared API for:
- owner dashboard
- admin panel
- customer app
- delivery app

Recommended admin approach:
- same Node.js + Express backend
- separate admin frontend
- role-based access control

## Main Collections

### 1. `owners`
Purpose:
- authentication identity for restaurant owners

Key fields:
- `_id`
- `fullName`
- `phone`
- `pendingPhone`
- `email`
- `passwordHash`
- `profileImage`
- `isPhoneVerified`
- `status` = `active | suspended | locked`
- `lastLoginAt`
- `createdAt`
- `updatedAt`

Relations:
- one owner can manage one or more restaurants later

### 2. `restaurants`
Purpose:
- approved live restaurant profile

Key fields:
- `_id`
- `ownerId`
- `name`
- `slug`
- `description`
- `cuisineTypes[]`
- `tags[]`
- `logo`
- `coverImage`
- `contact`
- `address`
- `location`
- `runtime`
- `discovery`
- `profileCompletion`
- `createdAt`
- `updatedAt`

Relations:
- belongs to owner
- has categories, menu items, vouchers, orders, reviews, payouts

Recommended nested objects:
- `runtime`
  - `isOnline`
  - `isVisible`
  - `currentOperationalStatus`
  - `averagePreparationTimeMinutes`
- `discovery`
  - `isFeatured`
  - `featuredSortOrder`
  - `collectionIds[]`

Final discovery rule:
- a restaurant should appear in customer discovery only if:
  - approved
  - online
  - currently open
  - not suspended

### 3. `restaurant_onboarding_drafts`
Purpose:
- onboarding draft before admin approval

Key fields:
- `_id`
- `ownerId`
- `restaurantId` nullable until approval publish
- `currentStep`
- `completedSteps[]`
- `skippedSteps[]`
- `basicInfo`
- `location`
- `openingHours`
- `payoutSetup`
- `draftSavedAt`
- `submittedAt`
- `resubmissionCount`
- `createdAt`
- `updatedAt`

### 4. `restaurant_review_cases`
Purpose:
- approval workflow between owner and admin

Key fields:
- `_id`
- `ownerId`
- `draftId`
- `restaurantId` nullable before approval
- `status` = `submitted | under_review | approved | rejected`
- `submittedSnapshot`
- `reviewNote`
- `reviewIssues[]`
- `reviewedByAdminId`
- `submittedAt`
- `reviewedAt`
- `createdAt`
- `updatedAt`

### 5. `categories`
Key fields:
- `_id`
- `restaurantId`
- `name`
- `slug`
- `description`
- `status` = `active | archived`
- `displayOrder`
- `createdAt`
- `updatedAt`

### 6. `menu_items`
Key fields:
- `_id`
- `restaurantId`
- `categoryId`
- `name`
- `slug`
- `description`
- `images[]`
- `status` = `active | archived`
- `availability` = `available | unavailable`
- `kind`
- `basePrice`
- `variants[]`
- `addOnGroups[]`
- `isPopular`
- `createdAt`
- `updatedAt`

### 7. `orders`
Key fields:
- `_id`
- `restaurantId`
- `customerId`
- `riderId`
- `orderNumber`
- `status`
- `terminalReason`
- `cancelledBy`
- `rejectionReason`
- `paymentMethod`
- `paymentStatus`
- `pricing`
- `customerSnapshot`
- `riderSnapshot`
- `itemsSnapshot[]`
- `timestamps`
- `history[]`
- `createdAt`
- `updatedAt`

### 8. `notifications`
Key fields:
- `_id`
- `ownerId`
- `restaurantId`
- `type`
- `eventType`
- `entityType`
- `entityId`
- `title`
- `description`
- `actionPath`
- `isRead`
- `readAt`
- `createdAt`

### 9. `vouchers`
Key fields:
- `_id`
- `restaurantId`
- `createdByType`
- `createdById`
- `fundedBy`
- `stackingRule`
- `priority`
- `mode`
- `type`
- `name`
- `code`
- `discountValue`
- `minimumOrderAmount`
- `maxTotalUses`
- `maxUsesPerUser`
- `allowRepeatUsage`
- `status`
- `applicability`
- `categoryIds[]`
- `itemIds[]`
- `startsAt`
- `endsAt`
- `createdAt`
- `updatedAt`

### 10. `restaurant_collections`
Purpose:
- admin/system-managed restaurant merchandising groups for customer discovery

Examples:
- featured restaurants
- restaurants with offers
- restaurants with free delivery

Key fields:
- `_id`
- `key`
- `name`
- `type` = `static | dynamic`
- `criteria`
- `restaurantIds[]`
- `sortOrders[]`
- `isActive`
- `createdAt`
- `updatedAt`

Final rule:
- `featured` should support explicit admin sort order
- `offers` collection should be dynamic and derived from currently active vouchers/promotions
- restaurant can belong to multiple collections

### 11. `voucher_redemptions`
Purpose:
- store order-time promotion snapshot

Key fields:
- `_id`
- `orderId`
- `restaurantId`
- `voucherId`
- `voucherSnapshot`
- `discountBreakdown`
- `appliedAt`

### 12. `reviews`
Key fields:
- `_id`
- `restaurantId`
- `customerId`
- `orderId`
- `rating`
- `comment`
- `ownerReply`
- `moderationStatus`
- `isHidden`
- `createdAt`
- `updatedAt`

### 13. `opening_hours`
Key fields:
- `_id`
- `restaurantId`
- `timezone`
- `weeklySchedule[]`
- `exceptions[]`
- `temporaryClosure`
- `updatedAt`

### 14. `payout_methods`
Key fields:
- `_id`
- `restaurantId`
- `type`
- `accountName`
- `accountNumber`
- `bankName`
- `branchName`
- `isVerified`
- `pendingAccountNumber`
- `verificationSource`
- `verifiedAt`
- `updatedAt`

### 15. `ledger_entries`
Purpose:
- finance source of truth

Key fields:
- `_id`
- `restaurantId`
- `orderId`
- `payoutBatchId`
- `sourceEntityType`
- `sourceEntityId`
- `entryType` = `earning | refund | payout | adjustment`
- `grossAmount`
- `commission`
- `discountCost`
- `deliveryCost`
- `netAmount`
- `settlementStatus` = `pending | available | paid_out`
- `availableAt`
- `createdAt`

### 16. `payout_batches`
Key fields:
- `_id`
- `restaurantId`
- `methodId`
- `amount`
- `status` = `pending | processing | completed | failed`
- `batchReference`
- `failureReason`
- `requestedAt`
- `processedAt`
- `createdAt`
- `updatedAt`

### 17. `support_cases`
Key fields:
- `_id`
- `ownerId`
- `restaurantId`
- `kind`
- `subject`
- `categoryId`
- `message`
- `status`
- `priority`
- `assignedAdminId`
- `createdAt`
- `updatedAt`

### 18. `restaurant_metrics`
Purpose:
- materialized fast-read metrics for owner dashboard, customer ranking, and admin reporting

Key fields:
- `_id`
- `restaurantId`
- `totalOrders`
- `totalDeliveredOrders`
- `totalCancelledOrders`
- `totalRevenue`
- `totalNetEarnings`
- `averageOrderValue`
- `averagePreparationTimeMinutes`
- `averageRating`
- `reviewCount`
- `repeatCustomerCount`
- `lastOrderAt`
- `lastAggregatedAt`
- `createdAt`
- `updatedAt`

Final rule:
- dashboard should read fast summary metrics from this document
- analytics can still use heavier aggregation endpoints for charts
- write-side events should update this document asynchronously

## Relationship Summary

- `owner -> restaurants`
  one-to-many future-safe
- `restaurant -> categories`
  one-to-many
- `restaurant -> menu_items`
  one-to-many
- `restaurant -> orders`
  one-to-many
- `restaurant -> notifications`
  one-to-many
- `restaurant -> vouchers`
  one-to-many
- `restaurant -> restaurant_collections`
  many-to-many through collection membership
- `restaurant -> reviews`
  one-to-many
- `restaurant -> ledger_entries`
  one-to-many
- `restaurant -> payout_batches`
  one-to-many
- `restaurant -> support_cases`
  one-to-many
- `restaurant -> restaurant_metrics`
  one-to-one summary document

## Production Notes

- Soft delete where possible
- Unique index on owner `phone`
- Unique index on category name per restaurant
- Unique index on menu slug per restaurant
- Unique index on voucher code per restaurant when mode = coupon
- Unique index on metrics `restaurantId`
- Unique index on collection `key`
- Use snapshot objects for:
  - submitted onboarding
  - order items
  - voucher redemption
