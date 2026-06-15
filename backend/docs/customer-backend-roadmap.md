# Customer Backend Roadmap

## Goal
- complete the shared marketplace backend before frontend integration
- keep backend contracts stable for both `restaurant-owner-web` and `customer-app`

## Recommended Build Order

### 1. Customer Auth Foundation
- customer phone sign-in with mock OTP
- customer Google sign-in contract
- customer refresh/logout flow
- customer profile entity

### 2. Discovery and Read APIs
- featured restaurants
- restaurants with offers
- restaurant search/listing
- restaurant details
- category/menu read APIs

### 3. Voucher and Offer Engine
- active voucher listing per restaurant
- customer-facing offer visibility
- coupon validation
- order-time voucher resolution snapshot

### 4. Cart and Checkout
- cart validation
- price recomputation on server
- voucher application
- delivery fee and commission-safe totals
- order placement

### 5. Customer Orders
- order listing
- order details
- cancel rules
- live tracking status
- notification hooks

### 6. Reviews and Post-Order
- customer review creation
- edit rules if allowed
- moderation-safe publication

### 7. Delivery / Rider Integration Readiness
- rider assignment hooks
- picked up / delivered transitions
- customer tracking updates

## Current Status
- owner backend foundation: strong
- customer backend foundation: starting now

## Final Integration Order
1. finish shared backend core
2. connect `restaurant-owner-web`
3. refine backend from real owner integration feedback
4. connect `customer-app`
