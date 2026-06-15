# API Payload Draft

This document defines the initial production-oriented API contract for the Foodbela multi-app ecosystem.

Stack target:
- Node.js
- Express.js
- MongoDB
- Socket.IO
- Cloudinary for media
- Mock OTP provider for now

## Conventions

### Base
- Base URL: `/api/v1`
- JSON only
- Timestamps: ISO-8601 UTC
- IDs: MongoDB ObjectId strings

### Standard Response
```json
{
  "success": true,
  "message": "Optional human readable message",
  "data": {},
  "meta": {}
}
```

### Standard Error
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": {
      "phone": "Invalid phone number"
    }
  }
}
```

## Auth

### POST `/auth/owner/signup`
Request
```json
{
  "fullName": "Meet Point Owner",
  "phone": "01712345678",
  "password": "secret123"
}
```

Response
```json
{
  "success": true,
  "message": "Owner account created. OTP sent.",
  "data": {
    "ownerId": "664f0c...",
    "verificationSessionId": "otp_owner_signup_01",
    "nextStatus": "account_created"
  }
}
```

### POST `/auth/owner/signin`
Request
```json
{
  "phone": "01712345678",
  "password": "secret123"
}
```

Response
```json
{
  "success": true,
  "message": "Signed in successfully",
  "data": {
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "owner": {
      "id": "664f0c...",
      "fullName": "Meet Point Owner",
      "phone": "01712345678",
      "isPhoneVerified": true
    },
    "restaurantLifecycleStatus": "submitted"
  }
}
```

### POST `/auth/owner/logout`
Request
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

### POST `/auth/otp/send`
Used for:
- signup verification
- phone change verification
- payout bKash verification
- password reset

Request
```json
{
  "channel": "phone",
  "phone": "01712345678",
  "purpose": "owner_signup_verify",
  "referenceId": "664f0c..."
}
```

Response
```json
{
  "success": true,
  "message": "OTP sent",
  "data": {
    "verificationSessionId": "otp_session_01",
    "expiresInSeconds": 300,
    "mockCode": "123456"
  }
}
```

### POST `/auth/otp/verify`
Request
```json
{
  "verificationSessionId": "otp_session_01",
  "otpCode": "123456"
}
```

Response
```json
{
  "success": true,
  "message": "OTP verified",
  "data": {
    "verified": true,
    "purpose": "owner_signup_verify",
    "nextStatus": "phone_verified"
  }
}
```

### POST `/auth/password/forgot`
Request
```json
{
  "phone": "01712345678"
}
```

### POST `/auth/password/reset`
Request
```json
{
  "verificationSessionId": "otp_session_02",
  "newPassword": "newSecret123"
}
```

## Owner Account

### GET `/owner/me`
Response
```json
{
  "success": true,
  "data": {
    "id": "664f0c...",
    "fullName": "Meet Point Owner",
    "phone": "01712345678",
    "pendingPhone": null,
    "email": "",
    "profileImage": {
      "url": "",
      "publicId": ""
    },
    "createdAt": "2026-04-13T12:00:00.000Z",
    "lastLoginAt": "2026-04-13T14:00:00.000Z",
    "isPhoneVerified": true
  }
}
```

### PATCH `/owner/me`
Request
```json
{
  "fullName": "Meet Point Owner",
  "email": "owner@example.com",
  "phone": "01711111111"
}
```

Rule:
- if phone changed, store in `pendingPhone`
- actual `phone` changes only after OTP verification

### PATCH `/owner/me/password`
Request
```json
{
  "currentPassword": "secret123",
  "newPassword": "newSecret123"
}
```

## Onboarding

### GET `/owner/onboarding/draft`
Response
```json
{
  "success": true,
  "data": {
    "lifecycleStatus": "onboarding_in_progress",
    "draft": {
      "basicInfo": {},
      "location": {},
      "openingHours": {},
      "payoutSetup": {},
      "completion": {
        "percentage": 55,
        "completedWeight": 55
      }
    }
  }
}
```

### PUT `/owner/onboarding/draft`
Request
```json
{
  "currentStep": "location",
  "basicInfo": {
    "restaurantName": "Meet Point",
    "fullName": "Meet Point Owner",
    "phone": "01712345678",
    "email": "",
    "description": "Fast food and burgers",
    "cuisineTypes": ["Fast Food", "Burger"],
    "tags": ["Burger", "Combo"],
    "logo": {
      "url": "",
      "publicId": ""
    },
    "coverImage": {
      "url": "",
      "publicId": ""
    }
  },
  "location": {
    "address": "Station Road, Netrokona",
    "city": "Netrokona",
    "latitude": 24.8831,
    "longitude": 90.7282
  },
  "openingHours": {},
  "payoutSetup": {
    "type": "bkash",
    "accountName": "Meet Point",
    "accountNumber": "01712345678"
  }
}
```

### POST `/owner/onboarding/submit`
Request
```json
{
  "confirm": true
}
```

Response
```json
{
  "success": true,
  "message": "Submitted for review",
  "data": {
    "restaurantLifecycleStatus": "submitted",
    "submittedAt": "2026-04-13T15:00:00.000Z"
  }
}
```

## Review Status

### GET `/owner/review-status`
Response
```json
{
  "success": true,
  "data": {
    "restaurantLifecycleStatus": "rejected",
    "submittedAt": "2026-04-13T15:00:00.000Z",
    "estimatedReviewTimeHours": 24,
    "reviewNote": "Please correct the highlighted sections and resubmit.",
    "reviewIssues": [
      {
        "section": "location",
        "title": "Location details are incomplete",
        "fields": ["latitude", "longitude"],
        "note": "We could not verify the exact coordinates."
      }
    ],
    "resubmissionCount": 1
  }
}
```

## Store Settings

### GET `/owner/store-settings`
### PATCH `/owner/store-settings`

Request
```json
{
  "name": "Meet Point",
  "description": "Fast food and burgers",
  "cuisineTypes": ["Fast Food", "Burger"],
  "tags": ["Burger", "Combo"],
  "address": "Station Road, Netrokona",
  "location": {
    "city": "Netrokona",
    "latitude": 24.8831,
    "longitude": 90.7282
  },
  "notifications": {
    "newOrder": true,
    "cancellation": true
  }
}
```

## Owner Dashboard Summary

### GET `/owner/dashboard/summary`
Response
```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "665100...",
      "name": "Meet Point",
      "isOnline": true,
      "isVisible": true,
      "currentOperationalStatus": "open",
      "averagePreparationTimeMinutes": 24
    },
    "metrics": {
      "totalOrders": 1824,
      "totalDeliveredOrders": 1710,
      "totalCancelledOrders": 62,
      "totalRevenue": 482200,
      "totalNetEarnings": 369800,
      "averageOrderValue": 264,
      "averagePreparationTimeMinutes": 24,
      "averageRating": 4.6,
      "reviewCount": 318
    }
  }
}
```

## Opening Hours

### GET `/owner/opening-hours`
### PUT `/owner/opening-hours`

Request
```json
{
  "timezone": "Asia/Dhaka",
  "weeklySchedule": [
    {
      "day": "monday",
      "isOpen": true,
      "timeSlots": [
        {
          "startTime": "10:00",
          "endTime": "23:00"
        }
      ]
    }
  ],
  "exceptions": [
    {
      "date": "2026-12-25",
      "label": "Holiday closure",
      "isOpen": false,
      "timeSlots": []
    }
  ],
  "temporaryClosure": {
    "isPaused": false,
    "mode": null,
    "resumeAt": null,
    "reason": ""
  }
}
```

Final visibility rule:
- customer app should show the restaurant only when:
  - restaurant is approved
  - `runtime.isOnline = true`
  - current time falls inside valid schedule/exception window
  - no temporary closure is active

## Categories

### GET `/owner/categories`
### POST `/owner/categories`
### PATCH `/owner/categories/:categoryId`
### DELETE `/owner/categories/:categoryId`

Create request
```json
{
  "name": "Burgers",
  "description": "Signature burger lineup"
}
```

## Menu Items

### GET `/owner/menu-items`
### POST `/owner/menu-items`
### PATCH `/owner/menu-items/:itemId`
### DELETE `/owner/menu-items/:itemId`

Create request
```json
{
  "name": "Classic Chicken Burger",
  "categoryId": "665001...",
  "description": "Crispy fried chicken with mayo",
  "status": "active",
  "availability": "available",
  "kind": "simple",
  "basePrice": 220,
  "variants": [],
  "addOnGroups": []
}
```

## Orders

### GET `/owner/orders`
Query
- `tab=live|history`
- `status=New`
- `search=FB-2401`
- `paymentMethod=Cash`
- `from=2026-04-01`
- `to=2026-04-10`

### GET `/owner/orders/:orderId`

### POST `/owner/orders/:orderId/transition`
Request
```json
{
  "nextStatus": "Accepted",
  "actor": "owner",
  "note": "Accepted from owner dashboard"
}
```

## Notifications

### GET `/owner/notifications`
### PATCH `/owner/notifications/:notificationId/read`
### PATCH `/owner/notifications/read-all`

## Promotions

### GET `/owner/vouchers`
### POST `/owner/vouchers`
### PATCH `/owner/vouchers/:voucherId`

Create request
```json
{
  "name": "BKASH50",
  "code": "BKASH50",
  "mode": "coupon",
  "type": "flat",
  "discountValue": 50,
  "minimumOrderAmount": 300,
  "maxTotalUses": 300,
  "maxUsesPerUser": 2,
  "allowRepeatUsage": true,
  "status": "Active",
  "applicability": "categories",
  "categoryIds": ["665010..."],
  "itemIds": [],
  "startsAt": "2026-04-20T00:00:00.000Z",
  "endsAt": "2026-05-01T23:59:59.000Z"
}
```

## Discovery and Collections

### GET `/admin/restaurant-collections`
### POST `/admin/restaurant-collections`
### PATCH `/admin/restaurant-collections/:collectionId`

Create featured collection request
```json
{
  "key": "featured_restaurants",
  "name": "Featured Restaurants",
  "type": "static",
  "restaurantIds": ["665100...", "665101..."],
  "sortOrders": [
    { "restaurantId": "665100...", "order": 1 },
    { "restaurantId": "665101...", "order": 2 }
  ],
  "isActive": true
}
```

Create dynamic offers collection request
```json
{
  "key": "restaurants_with_offers",
  "name": "Restaurants With Offers",
  "type": "dynamic",
  "criteria": {
    "hasActiveVoucher": true
  },
  "isActive": true
}
```

Final rule:
- featured sorting is admin-controlled
- offer/voucher collection is dynamic and system-resolved from active promotions
- owner does not directly manage collection membership

## Reviews

### GET `/owner/reviews`
### POST `/owner/reviews/:reviewId/reply`

Request
```json
{
  "message": "Thanks for your feedback."
}
```

## Payouts

### GET `/owner/payouts/summary`
### GET `/owner/payouts/history`
### GET `/owner/payout-transactions`
### PUT `/owner/payout-method`

Payout method request
```json
{
  "type": "bkash",
  "accountName": "Meet Point",
  "accountNumber": "01712345678"
}
```

Rule:
- if `accountNumber === owner.phone`, mark verified
- else create pending verification session

Owner payout requests are disabled. Admin finance creates and completes payouts
when restaurant earnings become eligible.

## Analytics

### GET `/owner/analytics/summary`
### GET `/owner/analytics/orders`
### GET `/owner/analytics/revenue`
### GET `/owner/analytics/customers`
### GET `/owner/analytics/menu-performance`

Query examples
- `preset=today`
- `preset=last7Days`
- `from=2026-04-01&to=2026-04-10`
- `orderType=delivery`
- `paymentMethod=Bkash`

Final rule:
- KPI summary should use precomputed metrics where possible
- chart endpoints may use deeper aggregations
- `totalOrders` and `averagePreparationTimeMinutes` must be available without expensive per-request aggregation

## Support Cases

### GET `/owner/support-cases`
### POST `/owner/support-cases`

Request
```json
{
  "kind": "report",
  "subject": "Order rejection reason not saving",
  "categoryId": "technical",
  "message": "Reason did not appear in order history after rejection."
}
```

## Media

### POST `/media/upload-signature`
Response
```json
{
  "success": true,
  "data": {
    "cloudName": "demo-cloud",
    "folder": "foodbela/owner",
    "timestamp": 1712999999,
    "signature": "signed-value",
    "apiKey": "cloudinary-api-key"
  }
}
```

## Socket.IO Events

### Owner Private Channel
- `owner:{ownerId}`
- `restaurant:{restaurantId}`

### Events
- `order.created`
- `order.updated`
- `notification.created`
- `support.updated`
- `review.created`
- `payout.updated`
