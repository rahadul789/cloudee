# Testing and Seed

## Seed
- command: `npm run seed`
- purpose:
  - ensure bootstrap admin exists
  - ensure discovery collections exist

## Preserve-auth reset seed
- preview: `npm run db:reset-preserve-auth:preview`
- local reset: set `CONFIRM_PRESERVE_AUTH_RESET=YES`, then run `npm run db:reset-preserve-auth`
- remote reset also requires `ALLOW_REMOTE_PRESERVE_AUTH_RESET=YES`
- production reset also requires `ALLOW_PRODUCTION_PRESERVE_AUTH_RESET=YES`
- preserves every document in:
  - `admins`
  - `adminrefreshtokensessions`
  - `customers`
  - `customerrefreshtokensessions`
- clears every other ordinary collection, then creates one 3 km zone centered at
  `24.877890, 90.731036`, 15 restaurants, and 680 menu items
- keeps the existing JWT secrets untouched; changing either JWT secret separately will
  invalidate existing customer sessions
- stop application writes and take a database backup before using this against a shared or
  production database

## Smoke Test
- command: `npm run test:smoke`
- current scope:
  - health endpoint basic check

## Recommended Next Tests
- owner signup/signin flow
- onboarding submit and review state
- customer phone auth flow
- customer cart quote and order placement
- admin review approval flow
