# Foodbela Backend

Production-oriented backend scaffold for:
- restaurant owner dashboard
- admin panel
- customer app
- delivery app

## Stack
- Node.js
- Express.js
- MongoDB
- Socket.IO
- Cloudinary
- Mock OTP for now

## Getting Started

1. Copy env file
```bash
cp .env.example .env
```

2. Install dependencies
```bash
npm install
```

3. Run in development
```bash
npm run dev
```

4. Build
```bash
npm run build
```

## Current Scaffold Includes
- env validation
- logger
- MongoDB connection bootstrap
- Socket.IO bootstrap
- error handling
- request id middleware
- auth module shell
- owner module shell
- health route

## Current API Prefix
- `/api/v1`

## Important Docs
- `docs/api-payload-draft.md`
- `docs/entity-relationship-data-model.md`
- `docs/status-transition-matrix.md`

## Next Recommended Implementation Order
1. database schemas
2. auth + OTP module
3. owner account module
4. onboarding + review module
5. restaurant profile + settings
6. orders + notifications + socket events
7. payouts + ledger
8. promotions + voucher redemption
9. analytics aggregation
